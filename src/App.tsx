import { useEffect, useState } from "react";
import type { RoomState } from "../shared/protocol.ts";
import { onAudioBlocked, playPreview, prepareAudio, retryPlay, stopAudio, warmAudio } from "./audio.ts";
import { loadName, loadSeat, saveSeat, serverTime, socket, syncClock } from "./net.ts";
import { Home } from "./screens/Home.tsx";
import { Lobby } from "./screens/Lobby.tsx";
import { Countdown, Loading } from "./screens/Countdown.tsx";
import { QuestionScreen } from "./screens/Question.tsx";
import { RevealScreen } from "./screens/Reveal.tsx";
import { Podium } from "./screens/Podium.tsx";

export function App() {
  const [state, setState] = useState<RoomState | null>(null);
  const [me, setMe] = useState<string | null>(null);
  // Only complain about the connection once we've had one (avoids a flash on load).
  const [connected, setConnected] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    const onState = (s: RoomState) => {
      syncClock(s.serverNow);
      setState(s);
    };
    // Re-take our seat after a reload or a dropped connection.
    const onConnect = () => {
      setConnected(true);
      const seat = loadSeat();
      if (!seat) return;
      socket.emit("room:join", { code: seat.code, name: loadName(), playerId: seat.playerId }, (r) => {
        if (r.ok) setMe(r.playerId);
        else {
          saveSeat(null);
          setState(null);
          setMe(null);
        }
      });
    };
    const onDisconnect = () => setConnected(false);
    socket.on("state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) onConnect();
    onAudioBlocked(setAudioBlocked);
    return () => {
      socket.off("state", onState);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // Music: loads (muted) during the countdown, plays from the moment the
  // question appears until the next countdown. The next song is fetched early.
  const round = state?.round;
  const previewUrl = round?.question?.previewUrl;
  const preload = round?.preload;
  const phase = state?.phase;
  useEffect(() => {
    if ((phase === "question" || phase === "reveal") && previewUrl && round) {
      playPreview(previewUrl, Math.max(0, (serverTime() - round.startsAt) / 1000));
    } else if (phase === "countdown" && preload) {
      prepareAudio(preload);
    } else {
      stopAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, previewUrl, preload]);
  useEffect(() => {
    if ((phase === "question" || phase === "reveal") && preload) warmAudio(preload);
  }, [phase, preload]);

  const entered = (code: string, playerId: string) => {
    saveSeat({ code, playerId });
    setMe(playerId);
  };

  const leave = () => {
    socket.emit("room:leave");
    saveSeat(null);
    stopAudio();
    setState(null);
    setMe(null);
    history.replaceState(null, "", location.pathname);
  };

  let screen;
  if (!state || !me) screen = <Home onEntered={entered} />;
  else if (state.phase === "lobby") screen = <Lobby state={state} me={me} onLeave={leave} />;
  else if (state.phase === "loading") screen = <Loading />;
  else if (state.phase === "countdown" && state.round) screen = <Countdown round={state.round} />;
  else if (state.phase === "question" && state.round) screen = <QuestionScreen key={state.round.index} state={state} me={me} />;
  else if (state.phase === "reveal" && state.round) screen = <RevealScreen state={state} me={me} />;
  else if (state.phase === "podium") screen = <Podium state={state} me={me} onLeave={leave} />;
  else screen = <Loading />;

  return (
    <div className="app">
      {!connected && <div className="banner">Reconectando…</div>}
      {audioBlocked && (phase === "question" || phase === "reveal") && (
        <button className="banner banner-action" onClick={retryPlay}>
          🔇 Toca aquí para activar el sonido
        </button>
      )}
      {screen}
    </div>
  );
}
