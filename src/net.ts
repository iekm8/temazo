import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";

export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: true });

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
