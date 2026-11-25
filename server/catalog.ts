import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

/** Fresh 30s preview URL from Deezer (they are signed and expire, so cache briefly). */
const cache = new Map<number, { url: string; at: number }>();
const TTL = 30 * 60 * 1000;

export async function getPreview(deezerId: number): Promise<string | null> {
  const hit = cache.get(deezerId);
  if (hit && Date.now() - hit.at < TTL) return hit.url;
  try {
    const res = await fetch(`https://api.deezer.com/track/${deezerId}`);
    const json = (await res.json()) as { preview?: string };
    if (!json.preview) return null;
    cache.set(deezerId, { url: json.preview, at: Date.now() });
    return json.preview;
  } catch {
    return null;
  }
}
