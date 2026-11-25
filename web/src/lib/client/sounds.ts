/**
 * Tempo's alert and tick sounds, synthesised with the Web Audio API.
 *
 * Pomotroid's idea of a distinct alert per round type plus an optional tick is reused, but its
 * bundled MP3 files are not: they carry no stated source or licence of their own. Generating the
 * sounds keeps Tempo free of third-party audio assets.
 */
type Cue = "focus" | "short_break" | "long_break";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, at: number, length: number, peak: number, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + at;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.05);
}

/** Three recognisable cues: rising for "back to focus", falling for a break, a longer chord for a long break. */
const CUES: Record<Cue, [number, number, number][]> = {
  focus: [[523.25, 0, 0.32], [659.25, 0.16, 0.32], [783.99, 0.32, 0.45]],
  short_break: [[783.99, 0, 0.32], [659.25, 0.16, 0.4]],
  long_break: [[523.25, 0, 0.9], [659.25, 0.05, 0.9], [783.99, 0.1, 0.9], [1046.5, 0.45, 0.8]],
};

export function playCue(cue: Cue, volume = 70) {
  const c = audio();
  if (!c) return;
  const peak = 0.22 * Math.min(1, Math.max(0, volume / 100));
  for (const [f, at, len] of CUES[cue]) tone(c, f, at, len, peak);
}

/** A short, soft click once a second (Pomotroid's optional tick). */
export function playTick(volume = 70) {
  const c = audio();
  if (!c) return;
  tone(c, 1800, 0, 0.03, 0.03 * Math.min(1, Math.max(0, volume / 100)), "triangle");
}
