/*
 * Round sequencing ported from Pomotroid (src-tauri/src/timer/sequence.rs).
 * Copyright (c) 2018 Christopher Murphy. MIT License; see THIRD_PARTY_NOTICES.md.
 * Mirrors android/.../domain/timer/RoundSequence.kt exactly.
 */
export type RoundType = "focus" | "short_break" | "long_break";
export interface RoundSettings { roundsBeforeLongBreak: number; shortBreaksEnabled: boolean; longBreaksEnabled: boolean; longBreakMinutes: number }
export interface RoundState { current: RoundType; focusRoundNumber: number; totalFocusRounds: number }

export const DEFAULT_ROUND_SETTINGS: RoundSettings = { roundsBeforeLongBreak: 4, shortBreaksEnabled: true, longBreaksEnabled: true, longBreakMinutes: 15 };
export const initialRoundState = (): RoundState => ({ current: "focus", focusRoundNumber: 1, totalFocusRounds: 1 });
const safeRounds = (s: RoundSettings) => Math.min(12, Math.max(1, Math.round(s.roundsBeforeLongBreak)));

export function advanceRound(st: RoundState, s: RoundSettings): RoundState {
  const total = safeRounds(s);
  const nextFocus = (n: number): RoundState => ({ current: "focus", focusRoundNumber: n, totalFocusRounds: st.totalFocusRounds + 1 });
  switch (st.current) {
    case "focus":
      if (st.focusRoundNumber >= total && s.longBreaksEnabled) return { ...st, current: "long_break" };
      if (st.focusRoundNumber >= total && s.shortBreaksEnabled) return { ...st, current: "short_break", focusRoundNumber: 0 };
      if (st.focusRoundNumber >= total) return nextFocus(1);
      if (s.shortBreaksEnabled) return { ...st, current: "short_break" };
      return nextFocus(st.focusRoundNumber + 1);
    case "short_break":
      return nextFocus(st.focusRoundNumber + 1);
    case "long_break":
      return nextFocus(1);
  }
}

export function roundLabel(st: RoundState, s: RoundSettings): string {
  if (st.current === "short_break") return "Short break";
  if (st.current === "long_break") return "Long break";
  return `Focus ${Math.max(1, st.focusRoundNumber)} of ${safeRounds(s)}`;
}
