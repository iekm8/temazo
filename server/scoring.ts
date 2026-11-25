/** Points for a correct answer: 500..1000 depending on how fast it came. */
export function speedPoints(elapsedMs: number, totalMs: number): number {
  const left = Math.min(1, Math.max(0, 1 - elapsedMs / totalMs));
  return Math.round(500 + 500 * left);
}

/** ¿De qué año es?: exact = 1000, then drops fast. */
export function yearPoints(guess: number, actual: number): number {
  const diff = Math.abs(guess - actual);
  return [1000, 700, 400, 200][diff] ?? 0;
}

/** Hides letters/digits of a title (expected in NFC), keeping the positions in `shown`. */
export function makeMask(title: string, shown: Set<number> = new Set()): string {
  return [...title].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) && !shown.has(i) ? "_" : ch)).join("");
}

/** Picks extra letter positions to reveal so that `fraction` of them are visible. */
export function revealMore(title: string, shown: Set<number>, fraction: number, rand = Math.random): Set<number> {
  const letters = [...title].flatMap((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? [i] : []));
  const target = Math.floor(letters.length * fraction);
  const next = new Set(shown);
  const hidden = letters.filter((i) => !next.has(i));
  while (next.size < target && hidden.length) {
    next.add(hidden.splice(Math.floor(rand() * hidden.length), 1)[0]);
  }
  return next;
}
