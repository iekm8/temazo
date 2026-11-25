/** Lowercase, strip accents, "(feat...)" / "(Remix)" parts and punctuation. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(feat|ft)\.?\s.*$/g, " ")
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1, 1 = identical (after normalising). */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  const max = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / max;
}

export type GuessResult = "correct" | "close" | "wrong";

/**
 * Typo-tolerant check of a typed guess against the accepted answers.
 * Short titles need to be (almost) exact, long ones allow a few typos.
 */
export function checkGuess(guess: string, answers: string[]): GuessResult {
  const g = normalize(guess);
  if (!g) return "wrong";
  let best = 0;
  for (const answer of answers) {
    const a = normalize(answer);
    if (!a) continue;
    if (g === a) return "correct";
    const allowed = a.length <= 3 ? 0 : a.length <= 6 ? 1 : a.length <= 12 ? 2 : 3;
    const dist = levenshtein(g, a);
    if (dist <= allowed) return "correct";
    if (a.length >= 5) best = Math.max(best, 1 - dist / Math.max(a.length, g.length));
  }
  return best >= 0.6 ? "close" : "wrong";
}
