import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";
import { deezerPreviews } from "./deezer.ts";

export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: true });

// The server may ask us (the host) to look up the song previews on Deezer.
socket.on("previews:resolve", (ids, ack) => {
  deezerPreviews(Array.isArray(ids) ? ids.slice(0, 60) : []).then(ack, () => ack([]));
});

/** serverTime ≈ Date.now() + offset */
let offset = 0;
export function syncClock(serverNow: number) {
  offset = serverNow - Date.now();
}
export function serverTime() {
  return Date.now() + offset;
}

// The current seat survives reloads of this tab (sessionStorage = per tab).
const SEAT = "temazo.seat";
export interface Seat {
  code: string;
  playerId: string;
}
export function loadSeat(): Seat | null {
  try {
    return JSON.parse(sessionStorage.getItem(SEAT) ?? "null");
  } catch {
    return null;
  }
}
export function saveSeat(seat: Seat | null) {
  try {
    if (seat) sessionStorage.setItem(SEAT, JSON.stringify(seat));
    else sessionStorage.removeItem(SEAT);
  } catch {}
}

const NAME = "temazo.name";
export function loadName(): string {
  try {
    return localStorage.getItem(NAME) ?? "";
  } catch {
    return "";
  }
}
export function saveName(name: string) {
  try {
    localStorage.setItem(NAME, name);
  } catch {}
}
