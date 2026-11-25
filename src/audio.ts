// One shared <audio> element. Mobile browsers (iOS especially) only allow
// playback on an element that was first started from a user tap, so we
// "unlock" it on the first click and reuse it for every round.

const el = new Audio();
el.preload = "auto";
let unlocked = false;
let blockedListener: ((blocked: boolean) => void) | null = null;

const SILENCE = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  el.src = SILENCE;
  el.play().then(() => el.pause()).catch(() => (unlocked = false));
}

export function onAudioBlocked(fn: (blocked: boolean) => void) {
  blockedListener = fn;
}

let currentUrl = "";
export function playPreview(url: string, offsetSec = 0) {
  if (currentUrl !== url) {
    currentUrl = url;
    el.src = url;
  }
  const start = () => {
    if (offsetSec > 0 && offsetSec < 29) el.currentTime = offsetSec;
  };
  if (el.readyState >= 1) start();
  else el.addEventListener("loadedmetadata", start, { once: true });
  el.volume = 1;
  el.play()
    .then(() => blockedListener?.(false))
    .catch(() => blockedListener?.(true));
}

export function retryPlay() {
  unlocked = true;
  el.play()
    .then(() => blockedListener?.(false))
    .catch(() => blockedListener?.(true));
}

export function stopAudio() {
  el.pause();
  currentUrl = "";
}
