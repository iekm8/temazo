import { useState } from "react";
import type { RoomState } from "../../shared/protocol.ts";
import { unlockAudio } from "../audio.ts";
import { socket } from "../net.ts";
import { PlayerChip } from "./parts.tsx";

const ROUND_OPTIONS = [5, 10, 15, 20];

export function Lobby({ state, me, onLeave }: { state: RoomState; me: string; onLeave: () => void }) {
  const isHost = state.hostId === me;
  const host = state.players.find((p) => p.id === state.hostId);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const link = `${location.origin}${location.pathname}?sala=${state.code}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Temazo", text: "¡Únete a mi sala de Temazo!", url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  const start = () => {
    unlockAudio();
    setStarting(true);
    setError("");
    socket.emit("game:start", (r) => {
      setStarting(false);
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <main className="screen lobby">
      <div className="topbar">
        <button className="link" onClick={onLeave}>
          ← Salir
        </button>
      </div>

      <section className="code-card">
        <span className="muted">Código de la sala</span>
        <div className="big-code">{state.code}</div>
        <button className="btn btn-secondary btn-sm" onClick={share}>
          {copied ? "¡Enlace copiado!" : "Invitar amigos"}
        </button>
      </section>

      <section className="card">
        <h2>
          Jugadores <span className="muted">{state.players.length}</span>
        </h2>
        <div className="chips">
          {state.players.map((p) => (
            <PlayerChip key={p.id} player={p} me={p.id === me} host={p.id === state.hostId} />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="mode on rules">
          <span className="mode-emoji">🎧</span>
          <span>
            <strong>Adivina el tema</strong>
            <small>Suena un trozo: escribe el título antes que nadie. Cuanto más rápido, más puntos.</small>
          </span>
        </div>
        <h2 className="mt">Canciones</h2>
        <div className="segmented">
          {ROUND_OPTIONS.map((n) => (
            <button
              key={n}
              className={state.settings.rounds === n ? "on" : ""}
              disabled={!isHost}
              onClick={() => socket.emit("room:settings", { ...state.settings, rounds: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <div className="bottom-bar">
        {isHost ? (
          <>
            {state.players.length < 2 && <p className="muted center">Es más divertido con 2 o más jugadores</p>}
            <button className="btn btn-primary" disabled={starting} onClick={start}>
              {starting ? "Cargando canciones…" : "¡Empezar!"}
            </button>
          </>
        ) : (
          <p className="muted center">Esperando a que {host?.name ?? "el anfitrión"} empiece la partida…</p>
        )}
        {(error || state.notice) && <p className="error">{error || state.notice}</p>}
      </div>
    </main>
  );
}
