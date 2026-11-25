import { useEffect, useState } from "react";
import { serverTime } from "./net.ts";

/** Milliseconds left until `endsAt` (server clock), refreshed ~10x per second. */
export function useTimeLeft(endsAt: number): number {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - serverTime()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, endsAt - serverTime())), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}
