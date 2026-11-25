import type { RoomState } from "../../shared/protocol.ts";
import { socket } from "../net.ts";
import { Avatar } from "./parts.tsx";

export function Podium({ state, me, onLeave }: { state: RoomState; me: string; onLeave: () => void }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const top = [ranked[1], ranked[0], ranked[2]]; // 2nd, 1st, 3rd
  const isHost = state.hostId === me;
  const winner = ranked[0];

  return (
    <main className="screen podium">
      <h1 className="winner">{winner ? `👑 ${winner.name} se lleva el temazo` : "Fin de la partida"}</h1>

      <div className="podium-stage">
        {top.map((p, i) =>
          p ? (
            <div key={p.id} className={`step step-${[2, 1, 3][i]}`}>
              <Avatar player={p} size={[48, 64, 44][i]} />
              <div className="step-name">{p.name}</div>
              <div className="step-score">{p.score}</div>
              <div className="step-block">{[2, 1, 3][i]}</div>
            </div>
          ) : (
            <div key={i} className="step empty" />
          ),
        )}
      </div>

      {ranked.length > 3 && (
        <ol className="results standings card" start={4}>
          {ranked.slice(3).map((p, i) => (
            <li key={p.id} className={p.id === me ? "me" : ""}>
              <span className="pos">{i + 4}</span>
              <Avatar player={p} size={28} />
              <span className="grow">{p.name}</span>
              <strong>{p.score}</strong>
            </li>
          ))}
        </ol>
      )}

      <div className="bottom-bar">
        {isHost ? (
          <button className="btn btn-primary" onClick={() => socket.emit("game:again")}>
            Jugar otra vez
          </button>
        ) : (
          <p className="muted center">El anfitrión puede empezar otra partida</p>
        )}
        <button className="btn btn-ghost" onClick={onLeave}>
          Salir de la sala
        </button>
      </div>
    </main>
  );
}
