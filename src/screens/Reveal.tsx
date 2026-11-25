import type { RoomState } from "../../shared/protocol.ts";
import { Avatar, RoundHeader } from "./parts.tsx";

export function RevealScreen({ state, me }: { state: RoomState; me: string }) {
  const round = state.round!;
  const r = round.reveal!;
  const players = new Map(state.players.map((p) => [p.id, p]));
  const results = [...r.results].sort((a, b) => b.points - a.points);
  const mine = r.results.find((x) => x.playerId === me);
  const standings = [...state.players].sort((a, b) => b.score - a.score);
  const [main, ...rest] = r.artists;

  return (
    <main className="screen reveal">
      <RoundHeader round={round} />

      <div className={`verdict ${mine?.points ? "good" : "bad"}`}>
        {mine?.points ? `+${mine.points} puntos` : round.mode === "title" ? "¡No lo sacaste!" : "¡Fallaste!"}
      </div>

      <section className="song-card">
        {r.cover && <img src={r.cover} alt="" className="cover" />}
        <div>
          <div className="song-title">{r.title}</div>
          <div className="song-artists">
            {main}
            {rest.length > 0 && <span className="muted"> ft. {rest.join(", ")}</span>}
          </div>
          <div className="song-year">{r.year}</div>
          {round.mode === "feat" && <div className="song-answer">Respuesta: {r.answer}</div>}
        </div>
      </section>

      <section className="card">
        <h2>Esta ronda</h2>
        <ol className="results">
          {results.map((x) => {
            const p = players.get(x.playerId);
            if (!p) return null;
            return (
              <li key={x.playerId} className={x.points ? "" : "zero"}>
                <Avatar player={p} size={28} />
                <span className="grow">
                  {p.name}
                  {x.answer && <small className="muted"> · {x.answer}</small>}
                  {round.mode === "title" && x.correct && x.ms !== undefined && (
                    <small className="muted"> · {(x.ms / 1000).toFixed(1)}s</small>
                  )}
                </span>
                <strong>{x.points ? `+${x.points}` : "—"}</strong>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card">
        <h2>Clasificación</h2>
        <ol className="results standings">
          {standings.map((p, i) => (
            <li key={p.id} className={p.id === me ? "me" : ""}>
              <span className="pos">{i + 1}</span>
              <Avatar player={p} size={28} />
              <span className="grow">{p.name}</span>
              <strong>{p.score}</strong>
            </li>
          ))}
        </ol>
      </section>
      <p className="credit">Preview: Deezer</p>
    </main>
  );
}
