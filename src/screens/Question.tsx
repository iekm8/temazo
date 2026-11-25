import { useEffect, useRef, useState } from "react";
import { YEAR_MAX, YEAR_MIN, type RoomState } from "../../shared/protocol.ts";
import { useTimeLeft } from "../hooks.ts";
import { socket } from "../net.ts";
import { Equalizer, PlayerChip, RoundHeader, TimerBar } from "./parts.tsx";

type Feedback = { kind: "correct" | "close" | "wrong" | "locked"; text: string } | null;

export function QuestionScreen({ state, me }: { state: RoomState; me: string }) {
  const round = state.round!;
  const q = round.question!;
  const answered = new Set(round.answered);
  const iAnswered = answered.has(me);

  return (
    <main className="screen question">
      <RoundHeader round={round} />
      <TimerBar round={round} />
      <Equalizer />

      {q.mode === "title" && <TitleMode state={state} done={iAnswered} />}
      {q.mode === "feat" && <FeatMode state={state} done={iAnswered} />}
      {q.mode === "year" && <YearMode state={state} done={iAnswered} />}

      <div className="chips answered">
        {state.players
          .filter((p) => p.connected)
          .map((p) => (
            <PlayerChip key={p.id} player={p} me={p.id === me} done={answered.has(p.id)} />
          ))}
      </div>
    </main>
  );
}

function send(value: string, cb: (r: Feedback) => void) {
  socket.emit("answer", value, (r) => {
    if (!r.ok) return cb({ kind: "wrong", text: r.error });
    const text = { correct: "¡Correcto!", close: "¡Casi!", wrong: "No…", locked: "Ya has respondido" }[r.result];
    cb({ kind: r.result, text });
  });
}

// ---------- 🎧 Adivina el tema ----------

function TitleMode({ state, done }: { state: RoomState; done: boolean }) {
  const q = state.round!.question!;
  const [text, setText] = useState("");
  const [fb, setFb] = useState<Feedback>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const players = new Map(state.players.map((p) => [p.id, p]));

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [state.feed.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || done) return;
    const guess = text;
    setText("");
    send(guess, (r) => {
      setFb(r);
      if (r?.kind === "close") setText(guess); // let them fix the typo
    });
  };

  return (
    <>
      <div className="mask" aria-label="Título oculto">
        {q.mask!.split(" ").map((word, i) => (
          <span className="mask-word" key={i}>
            {[...word].map((ch, j) => (
              <span key={j} className={ch === "_" ? "slot" : "slot shown"}>
                {ch === "_" ? "" : ch}
              </span>
            ))}
          </span>
        ))}
      </div>

      <div className="feed" ref={feedRef}>
        {state.feed.length === 0 && <p className="muted center">Escribe el título en cuanto lo reconozcas</p>}
        {state.feed.map((f) => {
          const p = f.playerId ? players.get(f.playerId) : undefined;
          return (
            <div key={f.id} className={`feed-item ${f.kind}`}>
              {f.kind === "guess" && p && <strong style={{ color: p.color }}>{p.name}: </strong>}
              {f.kind === "correct" ? `✅ ${f.text}` : f.text}
            </div>
          );
        })}
      </div>

      {done ? (
        <div className="locked-in correct">¡Lo tienes! Espera al resto…</div>
      ) : (
        <form className="guess-bar" onSubmit={submit}>
          <input
            autoFocus
            value={text}
            maxLength={60}
            placeholder="¿Qué tema es?"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              if (fb) setFb(null);
            }}
          />
          <button className="btn btn-primary" type="submit">
            ➤
          </button>
          {fb && fb.kind !== "correct" && <span className={`toast ${fb.kind}`}>{fb.text}</span>}
        </form>
      )}
    </>
  );
}

// ---------- 🤝 ¿Quién está en el feat? ----------

function FeatMode({ state, done }: { state: RoomState; done: boolean }) {
  const q = state.round!.question!;
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (o: string) => {
    if (done || picked) return;
    setPicked(o);
    send(o, () => {});
  };
  return (
    <>
      <div className="prompt">
        <div className="prompt-title">{q.title}</div>
        <div className="prompt-sub">
          de <strong>{q.mainArtist}</strong> con…
        </div>
      </div>
      <div className="options">
        {q.options!.map((o, i) => (
          <button
            key={o}
            className={`option opt-${i} ${picked === o ? "picked" : ""} ${picked && picked !== o ? "dim" : ""}`}
            disabled={done || !!picked}
            onClick={() => pick(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {(done || picked) && <div className="locked-in">Respuesta fijada. Espera al resto…</div>}
    </>
  );
}

// ---------- 📅 ¿De qué año es? ----------

function YearMode({ state, done }: { state: RoomState; done: boolean }) {
  const q = state.round!.question!;
  const [year, setYear] = useState(2015);
  const [sent, setSent] = useState(false);
  const locked = done || sent;
  // If time runs out before they press "Fijar", send whatever year is selected.
  const left = useTimeLeft(state.round!.endsAt);
  useEffect(() => {
    if (!locked && left > 0 && left < 400) {
      setSent(true);
      send(String(year), () => {});
    }
  }, [left, locked, year]);
  const bump = (d: number) => setYear((y) => Math.min(YEAR_MAX, Math.max(YEAR_MIN, y + d)));
  return (
    <>
      <div className="prompt">
        <div className="prompt-title">{q.title}</div>
        <div className="prompt-sub">¿En qué año salió?</div>
      </div>
      <div className="year-picker">
        <button className="round-btn" disabled={locked} onClick={() => bump(-1)} aria-label="Un año menos">
          −
        </button>
        <div className="year-value">{year}</div>
        <button className="round-btn" disabled={locked} onClick={() => bump(1)} aria-label="Un año más">
          +
        </button>
      </div>
      <input
        className="year-slider"
        type="range"
        min={YEAR_MIN}
        max={YEAR_MAX}
        value={year}
        disabled={locked}
        onChange={(e) => setYear(Number(e.target.value))}
      />
      {locked ? (
        <div className="locked-in">Has dicho {year}. Espera al resto…</div>
      ) : (
        <button
          className="btn btn-primary"
          onClick={() => {
            setSent(true);
            send(String(year), () => {});
          }}
        >
          Fijar {year}
        </button>
      )}
    </>
  );
}
