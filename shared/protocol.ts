// Types shared by server and client.

export type Mode = "title" | "feat" | "year";

export const MODE_INFO: Record<Mode, { name: string; emoji: string; desc: string; seconds: number }> = {
  title: { name: "Adivina el tema", emoji: "🎧", desc: "Escribe el título antes que nadie", seconds: 25 },
  feat: { name: "¿Quién está en el feat?", emoji: "🤝", desc: "Elige quién colabora en el tema", seconds: 12 },
  year: { name: "¿De qué año es?", emoji: "📅", desc: "Cuanto más cerca, más puntos", seconds: 15 },
};

/** Minigames available in the web right now (the others stay in the code, switched off). */
export const ENABLED_MODES: Mode[] = ["title"];

export const YEAR_MIN = 2000;
export const YEAR_MAX = new Date().getFullYear();

export type Phase = "lobby" | "loading" | "countdown" | "question" | "reveal" | "podium";

export interface Settings {
  rounds: number;
  modes: Mode[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  color: string;
}

export interface Question {
  mode: Mode;
  previewUrl: string;
  /** title mode: the title with hidden letters, e.g. "T _ _ a" */
  mask?: string;
  /** feat / year modes */
  title?: string;
  mainArtist?: string;
  options?: string[];
}

export interface PlayerResult {
  playerId: string;
  points: number;
  correct: boolean;
  /** what they answered (year / option), or ms it took for title mode */
  answer?: string;
  ms?: number;
}

export interface Reveal {
  title: string;
  artists: string[];
  year: number;
  cover: string;
  /** the correct option for feat mode */
  answer: string;
  results: PlayerResult[];
}

export interface FeedItem {
  id: number;
  kind: "guess" | "correct" | "system";
  playerId?: string;
  text: string;
}

export interface RoundView {
  index: number; // 0-based
  total: number;
  mode: Mode;
  startsAt: number; // server ms
  endsAt: number; // server ms
  question?: Question; // hidden during countdown
  answered: string[]; // player ids that answered / guessed right
  /** Audio to load ahead of time: this round's during the countdown, the next one's afterwards. */
  preload?: string;
  reveal?: Reveal;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  notice?: string;
  players: PublicPlayer[];
  round?: RoundView;
  feed: FeedItem[];
  serverNow: number;
}

export type Ack<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServer {
  "room:create": (p: { name: string }, ack: (r: Ack<{ code: string; playerId: string }>) => void) => void;
  "room:join": (
    p: { code: string; name: string; playerId?: string },
    ack: (r: Ack<{ code: string; playerId: string }>) => void,
  ) => void;
  "room:leave": () => void;
  "room:settings": (s: Settings) => void;
  "game:start": (ack: (r: Ack) => void) => void;
  "game:again": () => void;
  answer: (value: string, ack: (r: Ack<{ result: "correct" | "close" | "wrong" | "locked" }>) => void) => void;
}

export interface ServerToClient {
  state: (s: RoomState) => void;
  /** Ask the host's browser for Deezer preview URLs (Deezer blocks many cloud servers). */
  "previews:resolve": (deezerIds: number[], ack: (urls: (string | null)[]) => void) => void;
}
