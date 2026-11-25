import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkGuess, normalize } from "../shared/text.ts";
import { makeMask, revealMore, speedPoints, yearPoints } from "../server/scoring.ts";
import { COUNTDOWN_MS, REVEAL_MS, Room } from "../server/room.ts";
import type { Song } from "../server/catalog.ts";

describe("checkGuess", () => {
  it("ignores accents, case and remix/feat parts", () => {
    expect(normalize("Tití Me Preguntó")).toBe("titi me pregunto");
    expect(checkGuess("titi me pregunto", ["Tití Me Preguntó"])).toBe("correct");
    expect(checkGuess("te bote", ["Te Boté (Remix)"])).toBe("correct");
  });
  it("tolerates small typos on long titles only", () => {
    expect(checkGuess("titi me pregunt", ["Tití Me Preguntó"])).toBe("correct");
    expect(checkGuess("mia", ["MIA"])).toBe("correct");
    expect(checkGuess("mio", ["MIA"])).toBe("wrong");
  });
  it("accepts alternative answers and flags close guesses", () => {
    expect(checkGuess("bzrp 52", ["Quevedo: Bzrp Music Sessions, Vol. 52", "Bzrp 52"])).toBe("correct");
    expect(checkGuess("si antes te hubiera", ["Si Antes Te Hubiera Conocido"])).toBe("close");
    expect(checkGuess("gasolina", ["Provenza"])).toBe("wrong");
  });
});

describe("scoring", () => {
  it("rewards speed and closeness", () => {
    expect(speedPoints(0, 10000)).toBe(1000);
    expect(speedPoints(10000, 10000)).toBe(500);
    expect(yearPoints(2019, 2019)).toBe(1000);
    expect(yearPoints(2017, 2019)).toBe(400);
    expect(yearPoints(2010, 2019)).toBe(0);
  });
  it("masks letters and reveals some", () => {
    expect(makeMask("La Bachata")).toBe("__ _______");
    const shown = revealMore("La Bachata", new Set(), 0.5);
    expect(shown.size).toBe(4);
    expect(makeMask("La Bachata", shown).replace(/[^_]/g, "").length).toBe(5);
  });
});

const songs: Song[] = [
  { id: "a", title: "Tusa", artists: ["Karol G", "Nicki Minaj"], year: 2019, deezerId: 1, cover: "" },
  { id: "b", title: "Gasolina", artists: ["Daddy Yankee"], year: 2004, deezerId: 2, cover: "" },
  { id: "c", title: "Dákiti", artists: ["Bad Bunny", "Jhayco"], year: 2020, deezerId: 3, cover: "" },
  { id: "d", title: "Provenza", artists: ["Karol G"], year: 2022, deezerId: 4, cover: "" },
];

describe("Room", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = async (modes: ("title" | "feat" | "year")[], rounds = 3) => {
    const room = new Room("ABCD", {
      songs,
      getPreview: async (id) => `https://x/${id}.mp3`,
      onChange: () => {},
      allowedModes: ["title", "feat", "year"],
    });
    const a = room.join("Ana");
    const b = room.join("Ana");
    if (!a.ok || !b.ok) throw new Error("join failed");
    room.updateSettings(a.playerId, { rounds, modes });
    expect((await room.start(b.playerId)).ok).toBe(false); // only host
    expect((await room.start(a.playerId)).ok).toBe(true);
    return { room, a: a.playerId, b: b.playerId };
  };

  it("only plays the enabled minigame (Adivina el tema) by default", () => {
    const room = new Room("ABCD", { songs, getPreview: async () => "u", onChange: () => {} });
    const a = room.join("Ana");
    if (!a.ok) throw new Error("join failed");
    room.updateSettings(a.playerId, { rounds: 5, modes: ["feat", "year"] });
    expect(room.view().settings).toEqual({ rounds: 5, modes: ["title"] });
  });

  it("dedupes names and makes the first player host", () => {
    const room = new Room("ABCD", { songs, getPreview: async () => "u", onChange: () => {} });
    const a = room.join("Ana");
    room.join("ana");
    const v = room.view();
    expect(v.players.map((p) => p.name)).toEqual(["Ana", "ana 2"]);
    expect(a.ok && v.hostId === a.playerId).toBe(true);
  });

  it("plays a title round: hides the answer, scores, ends early, then podium", async () => {
    const { room, a, b } = await setup(["title"], 1);
    expect(room.phase).toBe("countdown");
    expect(room.answer(a, "x")).toBe("locked");
    vi.advanceTimersByTime(COUNTDOWN_MS);
    expect(room.phase).toBe("question");
    const v = room.view();
    expect(JSON.stringify(v)).not.toMatch(/Tusa|Gasolina|Dákiti|Provenza/);
    const title = songs.find((s) => v.round!.question!.previewUrl.endsWith(`/${s.deezerId}.mp3`))!.title;
    expect(room.answer(a, "nope nope")).toBe("wrong");
    expect(room.view().feed.at(-1)?.text).toBe("nope nope");
    expect(room.answer(a, title)).toBe("correct");
    expect(room.answer(a, title)).toBe("locked");
    expect(room.answer(b, title)).toBe("correct");
    vi.advanceTimersByTime(800);
    expect(room.phase).toBe("reveal");
    const scores = room.view().players.map((p) => p.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    expect(scores[1]).toBeGreaterThan(0);
    vi.advanceTimersByTime(REVEAL_MS);
    expect(room.phase).toBe("podium");
  });

  it("feat rounds only use songs with collaborators and one answer per player", async () => {
    const { room, a } = await setup(["feat"], 2);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    const q = room.view().round!.question!;
    expect(q.options).toHaveLength(4);
    const song = songs.find((s) => s.artists[0] === q.mainArtist && s.title === q.title)!;
    expect(song.artists.length).toBeGreaterThan(1);
    const right = q.options!.find((o) => song.artists.includes(o))!;
    expect(q.options!.filter((o) => song.artists.includes(o))).toHaveLength(1);
    expect(room.answer(a, right)).toBe("correct");
    expect(room.answer(a, right)).toBe("locked");
  });

  it("year rounds give partial points and time out to reveal", async () => {
    const { room, a } = await setup(["year"], 1);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    const q = room.view().round!.question!;
    const song = songs.find((s) => s.title === q.title)!;
    expect(room.answer(a, String(song.year + 1))).toBe("close");
    vi.advanceTimersByTime(15000);
    expect(room.phase).toBe("reveal");
    expect(room.view().players[0].score).toBe(700);
  });

  it("passes host on disconnect and ends the round if the rest answered", async () => {
    const { room, a, b } = await setup(["year"], 1);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    room.answer(b, "2019");
    room.disconnect(a);
    expect(room.hostId).toBe(b);
    vi.advanceTimersByTime(800);
    expect(room.phase).toBe("reveal");
  });
});
