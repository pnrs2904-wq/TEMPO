/** Ported verbatim from Android data/model/EnergyLevel.kt. */
export interface EnergyLevel {
  level: number;
  title: string;
  shortLabel: string;
  description: string;
  defaultFocusMinutes: number;
  defaultBreakMinutes: number;
  /** CSS variable name for the accent colour. */
  accent: "blue" | "ochre" | "terracotta";
}

export const ENERGY_LEVELS: EnergyLevel[] = [
  { level: 1, title: "Very low energy", shortLabel: "Very low", description: "Minimal cognitive load, gentle start", defaultFocusMinutes: 15, defaultBreakMinutes: 8, accent: "blue" },
  { level: 2, title: "Low energy", shortLabel: "Low", description: "Steady low-intensity work", defaultFocusMinutes: 20, defaultBreakMinutes: 7, accent: "blue" },
  { level: 3, title: "Moderate energy", shortLabel: "Moderate", description: "Balanced, standard focus pace", defaultFocusMinutes: 25, defaultBreakMinutes: 5, accent: "ochre" },
  { level: 4, title: "High energy", shortLabel: "High", description: "Deep work, complex problem solving", defaultFocusMinutes: 35, defaultBreakMinutes: 6, accent: "terracotta" },
  { level: 5, title: "Very high energy", shortLabel: "Very high", description: "Peak mental clarity, sprint mode", defaultFocusMinutes: 45, defaultBreakMinutes: 8, accent: "terracotta" },
];

/** Unknown levels fall back to level 3 (Moderate), as on Android. */
export function energyLevel(level: number): EnergyLevel {
  return ENERGY_LEVELS.find((e) => e.level === level) ?? ENERGY_LEVELS[2];
}

export const defaultFocusMinutesFor = (level: number) => energyLevel(level).defaultFocusMinutes;
export const defaultBreakMinutesFor = (level: number) => energyLevel(level).defaultBreakMinutes;
