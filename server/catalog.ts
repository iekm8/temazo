import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalize } from "../shared/text.ts";

export interface Song {
  id: string;
  title: string;
  artists: string[];
  year: number;
  alt?: string[];
  deezerId: number;
  cover: string;
}

export const SONGS: Song[] = JSON.parse(
  readFileSync(fileURLToPath(new URL("./data/songs.json", import.meta.url)), "utf8"),
);

const cache = new Map<string, { url: string; at: number }>();
const DEEZER_TTL = 30 * 60 * 1000; // Deezer preview URLs are signed and expire
const ITUNES_TTL = 24 * 60 * 60 * 1000;

export type PreviewSource = "deezer" | "itunes";

/** Fresh 30s preview from Deezer. Throws with a readable reason on failure. */
export async function deezerPreview(song: Song): Promise<string> {
  const res = await fetch(`https://api.deezer.com/track/${song.deezerId}`, { signal: AbortSignal.timeout(6000) });
  const text = await res.text();
  let json: { preview?: string; error?: { message?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Deezer HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  if (json.error) throw new Error(`Deezer: ${json.error.message ?? "error"}`);
  if (!json.preview) throw new Error(`Deezer: sin preview (HTTP ${res.status})`);
  return json.preview;
}

/** Fallback: Apple's public iTunes Search API, matched by title + main artist. */
export async function itunesPreview(song: Song): Promise<string> {
  const term = encodeURIComponent(`${song.artists[0]} ${song.title}`);
  const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=15&country=ES`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { trackName: string; artistName: string; previewUrl?: string }[] };
  const title = normalize(song.title);
  const artist = normalize(song.artists[0]);
  const hit =
    json.results?.find(
      (r) => r.previewUrl && normalize(r.trackName) === title && normalize(r.artistName).includes(artist),
    ) ?? json.results?.find((r) => r.previewUrl && normalize(r.artistName).includes(artist) && normalize(r.trackName).startsWith(title));
  if (!hit?.previewUrl) throw new Error("iTunes: no encontrado");
  return hit.previewUrl;
}

export async function getPreview(song: Song): Promise<string | null> {
  const hit = cache.get(song.id);
  if (hit && Date.now() - hit.at < (hit.url.includes("dzcdn") ? DEEZER_TTL : ITUNES_TTL)) return hit.url;
  for (const [name, fn] of [
    ["deezer", deezerPreview],
    ["itunes", itunesPreview],
  ] as const) {
    try {
      const url = await fn(song);
      cache.set(song.id, { url, at: Date.now() });
      return url;
    } catch (e) {
      console.warn(`[preview] ${name} falló para "${song.title}": ${(e as Error).message}`);
    }
  }
  return null;
}
