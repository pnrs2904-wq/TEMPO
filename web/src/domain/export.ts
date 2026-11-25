/** Data export. Ported from Android domain/ExportHelper.kt; same columns, RFC 4180 CSV escaping. */
import { isoWithOffset } from "./time";
import type { Session } from "./types";

export const CSV_HEADER =
  "id,timestamp,iso_date,phase,energy,subject,session_type,planned_minutes,actual_seconds,status,focus_quality,difficulty,duration_feedback,distractions,notes";

function escapeCsv(value: string): string {
  // Leading = + - @ are neutralised so a spreadsheet does not run a note as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function generateCsv(sessions: Session[]): string {
  const rows = sessions.map((s) =>
    [
      s.id,
      s.timestamp,
      isoWithOffset(s.timestamp, s.tz),
      escapeCsv(s.phase),
      s.energy,
      escapeCsv(s.subject),
      escapeCsv(s.sessionType),
      s.plannedMinutes,
      s.actualSeconds,
      escapeCsv(s.status),
      s.focusQuality ?? "",
      s.difficulty ?? "",
      escapeCsv(s.durationFeedback ?? ""),
      s.distractions ?? "",
      escapeCsv(s.notes ?? ""),
    ].join(","),
  );
  return [CSV_HEADER, ...rows].join("\n") + "\n";
}

export function generateJson(sessions: Session[]): string {
  return JSON.stringify(
    sessions.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      isoDate: isoWithOffset(s.timestamp, s.tz),
      timeZone: s.tz,
      phase: s.phase,
      energy: s.energy,
      subject: s.subject,
      sessionType: s.sessionType,
      plannedMinutes: s.plannedMinutes,
      actualSeconds: s.actualSeconds,
      status: s.status,
      focusQuality: s.focusQuality,
      difficulty: s.difficulty,
      durationFeedback: s.durationFeedback,
      distractions: s.distractions,
      notes: s.notes,
      expectedDifficulty: s.expectedDifficulty,
      mockScore: s.mockScore,
      mockMaxScore: s.mockMaxScore,
    })),
    null,
    2,
  );
}
