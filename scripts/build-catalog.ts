/**
 * Builds server/data/songs.source.json from the most popular Deezer tracks of
 * the focus artists. Run: npm run build-catalog  (then: npm run resolve-songs)
 *
 * Usage: tsx scripts/build-catalog.ts [perArtist=15]
 */
import { writeFileSync } from "node:fs";
import { normalize } from "../shared/text.ts";

export const FOCUS_ARTISTS = [
  "Myke Towers",
  "Bad Bunny",
  "Mora",
  "Eladio Carrion",
  "Omar Courtz",
  "J Balvin",
  "Arcangel",
  "Ozuna",
  "Dei V",
  "Tainy",
];

const PER_ARTIST = Number(process.argv[2] ?? 15);
const SKIP = /remix|live|en vivo|sped up|slowed|acoustic|acústic|version|versión|instrumental|intro|interlude|skit/i;

const api = async (path: string) => {
  await new Promise((r) => setTimeout(r, 110)); // Deezer allows ~50 req / 5 s
  const res = await fetch(`https://api.deezer.com${path}`);
  return (await res.json()) as any;
};

// Tracks that aren't really songs for this game.
const DROP = new Set(["Red Bull Espiral #05", "I Love It"].map(normalize));
// Display titles Deezer writes in a weird way (spaced out letters, etc.).
const RENAME: Record<string, string> = {
  "M U S A E L E V Á": "Musa Elevá",
  "Q U E V A S H A C E R H O Y ?": "Qué Vas Hacer Hoy?",
  "S E X P L A Y L I S T 1": "Sex Playlist 1",
  "S I T E G U S T A N L A S G A T A S": "Si Te Gustan Las Gatas",
  "5 Estrellas (W Sound 23)": "5 Estrellas",
};

/** "Title (feat. X) [Y]" -> "Title" */
const cleanTitle = (t: string) => {
  const s = t
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/\s*[([](feat|ft|with|con|prod)[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(feat|ft).*$/i, "")
    .trim();
  return RENAME[s] ?? s;
};

/**
 * Deezer dates are often those of a re-release or the album, not the single.
 * Use the earliest date among this artist's versions of the same title.
 */
async function earliestYear(main: string, title: string, fallback: number): Promise<number> {
  const res = await api(`/search?q=${encodeURIComponent(`${main} ${title}`)}&limit=25`);
  const same = (res.data ?? [])
    .filter((t: any) => normalize(t.artist.name) === normalize(main) && normalize(cleanTitle(t.title)) === normalize(title))
    .slice(0, 6);
  let year = fallback;
  for (const t of same) {
    const full = await api(`/track/${t.id}`);
    const y = Number((full.release_date || full.album?.release_date || "").slice(0, 4));
    if (y > 1990 && y < year) year = y;
  }
  return year;
}

const songs: any[] = [];
const seen = new Set<string>();

for (const name of FOCUS_ARTISTS) {
  const found = await api(`/search/artist?q=${encodeURIComponent(name)}&limit=10`);
  const artist = (found.data ?? [])
    .filter((a: any) => normalize(a.name) === normalize(name))
    .sort((a: any, b: any) => b.nb_fan - a.nb_fan)[0];
  if (!artist) {
    console.log(`!! artist not found: ${name}`);
    continue;
  }
  const top = await api(`/artist/${artist.id}/top?limit=60`);
  let added = 0;
  for (const t of top.data ?? []) {
    if (added >= PER_ARTIST) break;
    if (!t.preview || SKIP.test(t.title) || SKIP.test(t.album?.title ?? "")) continue;
    const title = cleanTitle(t.title);
    const key = normalize(title);
    if (!key || seen.has(key) || DROP.has(key)) continue;
    const full = await api(`/track/${t.id}`);
    const date: string = full.release_date && full.release_date !== "0000-00-00" ? full.release_date : full.album?.release_date;
    const year = await earliestYear(full.artist.name, title, Number(date?.slice(0, 4)) || 9999);
    if (year === 9999) continue;
    const contributors: string[] = [full.artist.name, ...(full.contributors ?? []).map((c: any) => c.name)];
    const artists = [...new Set(contributors)];
    seen.add(key);
    added++;
    songs.push({
      title,
      artists,
      year,
      ...(title !== t.title ? { alt: [t.title.replace(/[​-‍⁠﻿]/g, "")] } : {}),
      deezerId: t.id,
      focus: artist.name,
    });
    console.log(`${artist.name.padEnd(14)} ${String(year)}  ${title}  —  ${artists.join(", ")}`);
  }
}

writeFileSync("server/data/songs.source.json", JSON.stringify(songs, null, 2) + "\n");
console.log(`\n${songs.length} songs written to server/data/songs.source.json`);
