import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";
import { SONGS, deezerPreview, getPreview, itunesPreview } from "./catalog.ts";
import { Room } from "./room.ts";

// In dev Vite owns PORT (5173) and proxies /socket.io to 3001.
const PORT = process.argv.includes("--dev") ? 3001 : Number(process.env.PORT ?? 3001);
const EMPTY_ROOM_TTL = 5 * 60 * 1000;

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient, {}, { code?: string; playerId?: string }>(http);

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

// Diagnostics: can this server reach the audio previews?
app.get("/health/preview", async (_req, res) => {
  const song = SONGS[Math.floor(Math.random() * SONGS.length)];
  const check = async (fn: (s: typeof song) => Promise<string>) => {
    try {
      return { ok: true, url: (await fn(song)).slice(0, 60) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };
  res.json({ song: `${song.artists[0]} - ${song.title}`, deezer: await check(deezerPreview), itunes: await check(itunesPreview) });
});

// In production the built web app is served from here too.
const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/socket\.io).*/, (_req, res) => res.sendFile(`${dist}/index.html`));
}

const rooms = new Map<string, Room>();
const cleanup = new Map<string, ReturnType<typeof setTimeout>>();

function newCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I / O to avoid confusion
  let code: string;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  while (rooms.has(code));
  return code;
}

function createRoom(): Room {
  const code = newCode();
  const room = new Room(code, {
    songs: SONGS,
    getPreview,
    onChange: (r) => io.to(r.code).emit("state", r.view()),
  });
  rooms.set(code, room);
  return room;
}

function scheduleCleanup(room: Room) {
  clearTimeout(cleanup.get(room.code));
  if (room.connectedCount > 0) return;
  cleanup.set(
    room.code,
    setTimeout(() => {
      if (room.connectedCount === 0) {
        room.destroy();
        rooms.delete(room.code);
        cleanup.delete(room.code);
      }
    }, EMPTY_ROOM_TTL),
  );
}

io.on("connection", (socket) => {
  const current = () => (socket.data.code ? rooms.get(socket.data.code) : undefined);

  const enter = (room: Room, name: string, playerId?: string) => {
    const res = room.join(name, playerId);
    if (!res.ok) return res;
    socket.data = { code: room.code, playerId: res.playerId };
    socket.join(room.code);
    clearTimeout(cleanup.get(room.code));
    socket.emit("state", room.view());
    return { ok: true as const, code: room.code, playerId: res.playerId };
  };

  socket.on("room:create", ({ name }, ack) => {
    ack(enter(createRoom(), String(name ?? "")));
  });

  socket.on("room:join", ({ code, name, playerId }, ack) => {
    const room = rooms.get(String(code ?? "").toUpperCase().trim());
    if (!room) return ack({ ok: false, error: "Esa sala no existe" });
    ack(enter(room, String(name ?? ""), playerId));
  });

  socket.on("room:leave", () => {
    const room = current();
    if (!room || !socket.data.playerId) return;
    room.leave(socket.data.playerId);
    socket.leave(room.code);
    socket.data = {};
    scheduleCleanup(room);
  });

  socket.on("room:settings", (s) => {
    const room = current();
    if (room && socket.data.playerId) room.updateSettings(socket.data.playerId, s);
  });

  socket.on("game:start", async (ack) => {
    const room = current();
    if (!room || !socket.data.playerId) return ack({ ok: false, error: "No estás en una sala" });
    ack(await room.start(socket.data.playerId));
  });

  socket.on("game:again", () => {
    const room = current();
    if (room && socket.data.playerId) room.playAgain(socket.data.playerId);
  });

  socket.on("answer", (value, ack) => {
    const room = current();
    if (!room || !socket.data.playerId) return ack({ ok: false, error: "No estás en una sala" });
    ack({ ok: true, result: room.answer(socket.data.playerId, String(value ?? "")) });
  });

  socket.on("disconnect", () => {
    const room = current();
    if (!room || !socket.data.playerId) return;
    // Another tab/socket of the same player may still be connected.
    const stillHere = [...io.sockets.sockets.values()].some(
      (s) => s.id !== socket.id && s.data.playerId === socket.data.playerId,
    );
    if (!stillHere) room.disconnect(socket.data.playerId);
    scheduleCleanup(room);
  });
});

http.listen(PORT, () => console.log(`Temazo server on http://localhost:${PORT} (${SONGS.length} canciones)`));
