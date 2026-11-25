import { checkGuess } from "../shared/text.ts";
import {
  ENABLED_MODES,
  MODE_INFO,
  YEAR_MAX,
  YEAR_MIN,
  type FeedItem,
  type Mode,
  type Phase,
  type PlayerResult,
  type RoomState,
  type Settings,
} from "../shared/protocol.ts";
import type { Song } from "./catalog.ts";
import { makeMask, revealMore, speedPoints, yearPoints } from "./scoring.ts";

export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 7000;
export const LOBBY_DROP_MS = 20000;
const MAX_PLAYERS = 12;
const COLORS = ["#ff3d7f", "#ffb800", "#2ee6a6", "#4da3ff", "#b36bff", "#ff7a3d", "#00d1d1", "#c6ff3d", "#ff5ce1", "#8f9bff", "#ff4d4d", "#5cffb0"];

interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  color: string;
  dropTimer?: ReturnType<typeof setTimeout>;
}

interface Answer {
  value: string;
  at: number;
  correct: boolean;
  points: number;
}

interface Round {
  song: Song;
  mode: Mode;
  previewUrl: string;
  options?: string[];
  correctOption?: string;
  shown: Set<number>;
  startsAt: number;
  endsAt: number;
  answers: Map<string, Answer>;
}

export type PreviewResolver = (songs: Song[]) => Promise<(string | null)[]>;

export interface RoomDeps {
  songs: Song[];
  getPreview: (song: Song) => Promise<string | null>;
  onChange: (room: Room) => void;
  rand?: () => number;
  /** Which minigames this room may play (defaults to ENABLED_MODES). */
  allowedModes?: Mode[];
}

export class Room {
  hostId = "";
  phase: Phase = "lobby";
  settings: Settings;
  players = new Map<string, Player>();
  /** Message for everyone in the lobby, e.g. why the game couldn't start. */
  notice?: string;
  private rounds: Round[] = [];
  private index = -1;
  private feed: FeedItem[] = [];
  private feedSeq = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private rand: () => number;

  constructor(
    readonly code: string,
    private deps: RoomDeps,
  ) {
    this.rand = deps.rand ?? Math.random;
    this.settings = { rounds: 10, modes: [...(deps.allowedModes ?? ENABLED_MODES)] };
  }

  // ---------- players ----------

  join(name: string, playerId?: string): { ok: true; playerId: string } | { ok: false; error: string } {
    const existing = playerId ? this.players.get(playerId) : undefined;
    if (existing) {
      existing.connected = true;
      clearTimeout(existing.dropTimer);
      if (!this.connectedHost()) this.hostId = existing.id;
      this.changed();
      return { ok: true, playerId: existing.id };
    }
    if (this.phase !== "lobby") return { ok: false, error: "La partida ya ha empezado" };
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: "La sala está llena" };
    const clean = name.trim().slice(0, 16) || "Jugador";
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let finalName = clean;
    for (let n = 2; taken.has(finalName.toLowerCase()); n++) finalName = `${clean} ${n}`;
    const id = Math.random().toString(36).slice(2, 10);
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const color = COLORS.find((c) => !usedColors.has(c)) ?? COLORS[this.players.size % COLORS.length];
    this.players.set(id, { id, name: finalName, score: 0, connected: true, color });
    if (!this.connectedHost()) this.hostId = id;
    this.changed();
    return { ok: true, playerId: id };
  }

  disconnect(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;
    if (this.hostId === playerId) {
      const next = [...this.players.values()].find((x) => x.connected);
      if (next) this.hostId = next.id;
    }
    // In the lobby, people who don't come back are removed after a while.
    if (this.phase === "lobby") {
      p.dropTimer = setTimeout(() => {
        if (!p.connected && this.phase === "lobby") {
          this.players.delete(p.id);
          this.changed();
        }
      }, LOBBY_DROP_MS);
    }
    this.maybeEndRoundEarly();
    this.changed();
  }

  leave(playerId: string) {
    this.disconnect(playerId);
    const p = this.players.get(playerId);
    if (p && this.phase === "lobby") {
      clearTimeout(p.dropTimer);
      this.players.delete(playerId);
      this.changed();
    }
  }

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  private connectedHost() {
    return this.players.get(this.hostId)?.connected ? this.hostId : null;
  }

  // ---------- settings / lifecycle ----------

  updateSettings(playerId: string, s: Settings) {
    if (playerId !== this.hostId || this.phase !== "lobby") return;
    const allowed = this.deps.allowedModes ?? ENABLED_MODES;
    const modes = (s.modes ?? []).filter((m) => allowed.includes(m));
    this.settings = {
      rounds: Math.min(30, Math.max(1,Math.round(s.rounds) || 10)),
      modes: modes.length ? [...new Set(modes)] : this.settings.modes,
    };
    this.changed();
  }

  /**
   * @param fallbacks tried in order for the songs whose preview the server
   * couldn't get (e.g. ask the host's browser, then iTunes).
   */
  async start(
    playerId: string,
    fallbacks: PreviewResolver[] = [],
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (playerId !== this.hostId) return { ok: false, error: "Solo el anfitrión puede empezar" };
    if (this.phase !== "lobby") return { ok: false, error: "La partida ya ha empezado" };
    this.phase = "loading";
    this.notice = undefined;
    this.changed();

    // Plan a few spare songs in case some previews can't be found.
    const wanted = this.settings.rounds;
    const planned = this.planRounds(Math.ceil(wanted * 1.4) + 1);
    const previews = await Promise.all(planned.map((r) => this.deps.getPreview(r.song)));
    for (const resolve of fallbacks) {
      const missing = previews.flatMap((p, i) => (p ? [] : [i]));
      if (!missing.length) break;
      const got = await resolve(missing.map((i) => planned[i].song)).catch(() => []);
      missing.forEach((i, k) => (previews[i] = got[k] ?? null));
    }
    this.rounds = planned
      .map((r, i) => ({ ...r, previewUrl: previews[i] ?? "" }))
      .filter((r) => r.previewUrl)
      .slice(0, wanted);
    if (!this.rounds.length) {
      const error = "No se pudieron cargar las canciones. Inténtalo otra vez en un momento.";
      this.phase = "lobby";
      this.notice = error; // shown in the lobby (the start button's screen was unmounted meanwhile)
      this.changed();
      return { ok: false, error };
    }
    for (const p of this.players.values()) p.score = 0;
    this.index = -1;
    this.nextRound();
    return { ok: true };
  }

  playAgain(playerId: string) {
    if (playerId !== this.hostId || this.phase !== "podium") return;
    this.clearTimers();
    this.phase = "lobby";
    this.rounds = [];
    this.index = -1;
    this.feed = [];
    for (const p of [...this.players.values()]) {
      p.score = 0;
      if (!p.connected) this.players.delete(p.id);
    }
    this.changed();
  }

  destroy() {
    this.clearTimers();
    for (const p of this.players.values()) clearTimeout(p.dropTimer);
  }

  private planRounds(rounds: number): Omit<Round, "previewUrl">[] {
    const { modes } = this.settings;
    const songs = this.shuffle([...this.deps.songs]);
    // How often each artist appears: frequent ones make better feat options
    // (nobody knows the DJ credited on one track).
    const freq = new Map<string, number>();
    for (const s of this.deps.songs) for (const a of s.artists) freq.set(a, (freq.get(a) ?? 0) + 1);
    const known = [...freq].filter(([, n]) => n >= 2).map(([a]) => a);
    const allArtists = known.length >= 8 ? known : [...freq.keys()];
    // Spread the modes evenly, in random order.
    const modeList = this.shuffle(Array.from({ length: rounds }, (_, i) => modes[i % modes.length]));
    const out: Omit<Round, "previewUrl">[] = [];
    for (let mode of modeList) {
      let idx = mode === "feat" ? songs.findIndex((s) => s.artists.length > 1) : 0;
      if (idx < 0) {
        mode = "title";
        idx = 0;
      }
      const song = songs.splice(idx, 1)[0];
      if (!song) break;
      const round: Omit<Round, "previewUrl"> = {
        song,
        mode,
        shown: new Set(),
        startsAt: 0,
        endsAt: 0,
        answers: new Map(),
      };
      if (mode === "feat") {
        // The best-known collaborator is the answer.
        const featured = this.shuffle(song.artists.slice(1)).sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0));
        round.correctOption = featured[0];
        const wrong = this.shuffle(allArtists.filter((a) => !song.artists.includes(a))).slice(0, 3);
        round.options = this.shuffle([round.correctOption, ...wrong]);
      }
      out.push(round);
    }
    return out;
  }

  private nextRound() {
    this.clearTimers();
    this.index++;
    this.feed = [];
    const round = this.rounds[this.index];
    if (!round) {
      this.phase = "podium";
      this.changed();
      return;
    }
    const total = MODE_INFO[round.mode].seconds * 1000;
    round.startsAt = Date.now() + COUNTDOWN_MS;
    round.endsAt = round.startsAt + total;
    this.phase = "countdown";
    this.changed();

    this.later(COUNTDOWN_MS, () => {
      this.phase = "question";
      this.changed();
    });
    if (round.mode === "title") {
      // Pinturillo-style hints: reveal some letters at 50% and 75% of the time.
      for (const [at, frac] of [[0.5, 0.2], [0.75, 0.4]] as const) {
        this.later(COUNTDOWN_MS + total * at, () => {
          round.shown = revealMore(round.song.title, round.shown, frac, this.rand);
          this.changed();
        });
      }
    }
    this.later(COUNTDOWN_MS + total, () => this.reveal());
  }

  // ---------- answers ----------

  answer(playerId: string, value: string): "correct" | "close" | "wrong" | "locked" {
    const round = this.rounds[this.index];
    const player = this.players.get(playerId);
    if (!round || !player || this.phase !== "question") return "locked";
    if (round.answers.get(playerId)?.correct || (round.mode !== "title" && round.answers.has(playerId))) {
      return "locked";
    }
    const now = Date.now();
    const elapsed = now - round.startsAt;
    const total = round.endsAt - round.startsAt;
    let result: "correct" | "close" | "wrong";
    let points = 0;

    if (round.mode === "title") {
      const text = value.trim().slice(0, 60);
      if (!text) return "wrong";
      result = checkGuess(text, [round.song.title, ...(round.song.alt ?? [])]);
      if (result === "correct") {
        points = speedPoints(elapsed, total);
        round.answers.set(playerId, { value: text, at: now, correct: true, points });
        this.pushFeed({ kind: "correct", playerId, text: `${player.name} lo ha adivinado` });
      } else if (result === "wrong") {
        // Wrong guesses are public (fun), close ones stay private so they don't leak the answer.
        this.pushFeed({ kind: "guess", playerId, text });
      }
    } else if (round.mode === "feat") {
      result = value === round.correctOption ? "correct" : "wrong";
      if (result === "correct") points = speedPoints(elapsed, total);
      round.answers.set(playerId, { value, at: now, correct: result === "correct", points });
    } else {
      const year = Math.round(Number(value));
      if (!Number.isFinite(year) || year < YEAR_MIN || year > YEAR_MAX) return "wrong";
      points = yearPoints(year, round.song.year);
      result = points === 1000 ? "correct" : points > 0 ? "close" : "wrong";
      round.answers.set(playerId, { value: String(year), at: now, correct: points === 1000, points });
    }
    this.changed();
    this.maybeEndRoundEarly();
    return result;
  }

  private maybeEndRoundEarly() {
    const round = this.rounds[this.index];
    if (!round || this.phase !== "question") return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    const done = connected.every((p) => {
      const a = round.answers.get(p.id);
      return round.mode === "title" ? a?.correct : a;
    });
    if (connected.length && done) {
      this.clearTimers();
      this.later(800, () => this.reveal());
    }
  }

  private reveal() {
    const round = this.rounds[this.index];
    if (!round || this.phase === "reveal") return;
    this.clearTimers();
    for (const [id, a] of round.answers) {
      const p = this.players.get(id);
      if (p) p.score += a.points;
    }
    this.phase = "reveal";
    this.changed();
    this.later(REVEAL_MS, () => this.nextRound());
  }

  // ---------- view ----------

  view(): RoomState {
    const round = this.rounds[this.index];
    const inRound = round && (this.phase === "countdown" || this.phase === "question" || this.phase === "reveal");
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      notice: this.notice,
      players: [...this.players.values()].map(({ id, name, score, connected, color }) => ({
        id,
        name,
        score,
        connected,
        color,
      })),
      feed: this.feed,
      serverNow: Date.now(),
      round: inRound
        ? {
            index: this.index,
            total: this.rounds.length,
            mode: round.mode,
            startsAt: round.startsAt,
            endsAt: round.endsAt,
            // Preview URLs are opaque CDN links, so sending them early doesn't leak the title.
            preload: this.phase === "countdown" ? round.previewUrl : this.rounds[this.index + 1]?.previewUrl,
            answered: [...round.answers.entries()]
              .filter(([, a]) => round.mode !== "title" || a.correct)
              .map(([id]) => id),
            question:
              this.phase === "countdown"
                ? undefined
                : {
                    mode: round.mode,
                    previewUrl: round.previewUrl,
                    mask: round.mode === "title" ? makeMask(round.song.title, round.shown) : undefined,
                    title: round.mode !== "title" ? round.song.title : undefined,
                    mainArtist: round.mode === "feat" ? round.song.artists[0] : undefined,
                    options: round.options,
                  },
            reveal:
              this.phase === "reveal"
                ? {
                    title: round.song.title,
                    artists: round.song.artists,
                    year: round.song.year,
                    cover: round.song.cover,
                    answer: round.correctOption ?? round.song.title,
                    results: [...this.players.values()].map((p): PlayerResult => {
                      const a = round.answers.get(p.id);
                      return {
                        playerId: p.id,
                        points: a?.points ?? 0,
                        correct: a?.correct ?? false,
                        answer: round.mode === "title" ? undefined : a?.value,
                        ms: a ? a.at - round.startsAt : undefined,
                      };
                    }),
                  }
                : undefined,
          }
        : undefined,
    };
  }

  // ---------- helpers ----------

  private pushFeed(item: Omit<FeedItem, "id">) {
    this.feed = [...this.feed, { ...item, id: ++this.feedSeq }].slice(-30);
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private changed() {
    this.deps.onChange(this);
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
