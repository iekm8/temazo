import { useState } from "react";
import { unlockAudio } from "../audio.ts";
import { loadName, saveName, socket } from "../net.ts";

export function Home({ onEntered }: { onEntered: (code: string, playerId: string) => void }) {
  const invite = new URLSearchParams(location.search).get("sala")?.toUpperCase() ?? "";
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(invite);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (kind: "create" | "join") => {
    unlockAudio();
    const n = name.trim();
    if (!n) return setError("Ponte un nombre primero");
    if (kind === "join" && code.trim().length !== 4) return setError("El código tiene 4 letras");
    saveName(n);
    setBusy(true);
    setError("");
    const done = (r: { ok: true; code: string; playerId: string } | { ok: false; error: string }) => {
      setBusy(false);
      if (r.ok) onEntered(r.code, r.playerId);
      else setError(r.error);
    };
    if (kind === "create") socket.emit("room:create", { name: n }, done);
    else socket.emit("room:join", { code: code.trim().toUpperCase(), name: n }, done);
  };

  return (
    <main className="screen home">
      <header className="hero">
        <div className="logo">
          TEMA<span>ZO</span>
        </div>
        <p className="tagline">Adivina el tema con tus amigos: Bad Bunny, Myke Towers, Mora, Eladio, Ozuna y más</p>
      </header>

      <section className="card stack">
        <label className="field">
          <span>Tu nombre</span>
          <input
            value={name}
            maxLength={16}
            placeholder="Ej: Juan"
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {invite ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => go("join")}>
            Entrar a la sala {invite}
          </button>
        ) : (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => go("create")}>
              Crear sala
            </button>
            <div className="divider">o únete con un código</div>
            <div className="row">
              <input
                className="code-input"
                value={code}
                maxLength={4}
                placeholder="ABCD"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && go("join")}
              />
              <button className="btn btn-secondary" disabled={busy} onClick={() => go("join")}>
                Unirse
              </button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <ul className="how">
        <li>🎧 Suena un trozo de un temazo</li>
        <li>⌨️ Escribe el título antes que nadie</li>
        <li>🏆 Gana quien más acierte y más rápido</li>
      </ul>
      <p className="credit">Previews de audio de Deezer</p>
    </main>
  );
}
