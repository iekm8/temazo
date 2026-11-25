import { MODE_INFO, type RoundView } from "../../shared/protocol.ts";
import { useTimeLeft } from "../hooks.ts";
import { Equalizer } from "./parts.tsx";

export function Countdown({ round }: { round: RoundView }) {
  const left = useTimeLeft(round.startsAt);
  const n = Math.max(1, Math.ceil(left / 1000));
  const info = MODE_INFO[round.mode];
  return (
    <main className="screen countdown">
      <span className="pill">
        Ronda {round.index + 1} de {round.total}
      </span>
      <div className="countdown-emoji">{info.emoji}</div>
      <h1>{info.name}</h1>
      <p className="muted">{info.desc}</p>
      <div key={n} className="countdown-num">
        {n}
      </div>
    </main>
  );
}

export function Loading() {
  return (
    <main className="screen countdown">
      <Equalizer />
      <p className="muted">Preparando los temazos…</p>
    </main>
  );
}
