/**
 * Looks up every song of server/data/songs.source.json on Deezer and writes
 * server/data/songs.json with the Deezer track id + cover, so the game can
 * fetch a fresh 30s preview at play time. Run: npm run resolve-songs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { normalize, similarity } from "../shared/text.ts";

type Source = { title: string; artists: string[]; year: number; alt?: string[]; deezerId?: number };

const src: Source[] = JSON.parse(readFileSync("server/data/songs.source.json", "utf8"));
const out = [];
const problems: string[] = [];

for (const song of src) {
  if (song.deezerId) {
    // Manually pinned track (search picks the wrong version for a few songs).
    let t: any;
    for (let attempt = 0; attempt < 5 && !t?.album; attempt++) {
      // Deezer allows ~50 requests / 5 s; back off if it says "quota exceeded".
      await new Promise((r) => setTimeout(r, attempt ? 2000 : 120));
      t = await (await fetch(`https://api.deezer.com/track/${song.deezerId}`)).json();
    }
    if (!t?.album) {
      problems.push(`NOT FOUND: ${song.artists[0]} - ${song.title} (deezerId ${song.deezerId})`);
      continue;
    }
    const id = normalize(`${song.artists[0]} ${song.title}`).replace(/ /g, "-");
    out.push({ id, ...song, cover: t.album.cover_big });
    console.log(`pin ${song.artists[0]} - ${song.title}  ->  ${t.title} [${t.album.title}]`);
    continue;
  }
  const q = encodeURIComponent(`${song.artists[0]} ${song.title}`);
  const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=25`);
  const json = (await res.json()) as { data?: any[] };
  const candidates = (json.data ?? []).filter(
    (t) => t.preview && normalize(t.artist.name) === normalize(song.artists[0]),
  );
  // Prefer the original release: penalise "(Remix)", "(feat...)", remix albums,
  // compilations, etc. when the source title doesn't ask for them.
  const wantsExtra = /[([]/.test(song.title);
  const score = (t: any) => {
    let s = similarity(t.title, song.title);
    if (!wantsExtra && /[([]/.test(t.title)) s -= 0.3;
    if (/remix|version|live|en vivo/i.test(t.album.title) && !/remix/i.test(song.title)) s -= 0.3;
    if (/hits|reggaeton|compilation|lo mejor|best of|collection/i.test(t.album.title)) s -= 0.2;
    return s;
  };
  candidates.sort((a, b) => score(b) - score(a) || b.rank - a.rank);
  const hit = candidates[0];
  if (!hit || similarity(hit.title, song.title) < 0.5) {
    problems.push(`NOT FOUND: ${song.artists[0]} - ${song.title}`);
    continue;
  }
  const id = normalize(`${song.artists[0]} ${song.title}`).replace(/ /g, "-");
  out.push({ id, ...song, deezerId: hit.id, cover: hit.album.cover_big });
  console.log(`ok  ${song.artists[0]} - ${song.title}  ->  ${hit.title} [${hit.album.title}]`);
  await new Promise((r) => setTimeout(r, 120)); // be gentle with the API
}

writeFileSync("server/data/songs.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\n${out.length}/${src.length} resolved`);
if (problems.length) console.log(problems.join("\n"));
