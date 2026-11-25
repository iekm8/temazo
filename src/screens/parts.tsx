import type { PublicPlayer, RoundView } from "../../shared/protocol.ts";
import { MODE_INFO } from "../../shared/protocol.ts";
import { useTimeLeft } from "../hooks.ts";

export function Avatar({ player, size = 36 }: { player: PublicPlayer; size?: number }) {
  return (
    <span className="avatar" style={{ background: player.color, width: size, height: size, fontSize: size * 0.45 }}>
      {player.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PlayerChip({
  player,
  me,
  host,
  done,
}: {
  player: PublicPlayer;
  me?: boolean;
  host?: boolean;
  done?: boolean;
}) {
  return (
    <span className={`chip ${player.connected ? "" : "offline"} ${done ? "done" : ""}`}>
      <Avatar player={player} size={26} />
      <span className="chip-name">
        {player.name}
        {me && <em> (tú)</em>}
      </span>
      {host && <span title="Anfitrión">👑</span>}
      {done && <span className="tick">✓</span>}
    </span>
  );
}

export function RoundHeader({ round }: { round: RoundView }) {
  const info = MODE_INFO[round.mode];
  return (
    <div className="round-header">
      <span className="pill">
        {round.index + 1}/{round.total}
      </span>
      <span className="round-mode">
        {info.emoji} {info.name}
      </span>
    </div>
  );
}

export function TimerBar({ round }: { round: RoundView }) {
  const left = useTimeLeft(round.endsAt);
  const total = round.endsAt - round.startsAt;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const secs = Math.ceil(left / 1000);
  return (
    <div className="timer">
      <div className={`timer-fill ${secs <= 3 ? "hurry" : ""}`} style={{ width: `${pct}%` }} />
      <span className="timer-num">{secs}</span>
    </div>
  );
}

export function Equalizer() {
  return (
    <div className="eq" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}
