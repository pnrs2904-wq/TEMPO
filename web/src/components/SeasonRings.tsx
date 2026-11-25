"use client";
/**
 * Zoomed out: one ring per day, oldest at the centre and today at the rim, like tree rings.
 * Because every ring is the same 24-hour dial, habits show up as spokes: a band of arcs at the
 * same angle across many rings is a time of day that reliably works.
 */
import { addDays, formatDateKey, minutesOfDay, type DateKey } from "@/domain/time";
import type { Session } from "@/domain/types";
import { subjectColor } from "@/lib/subjectColor";
import { arcPath } from "./Ring";

const SIZE = 400;
const C = SIZE / 2;

interface Props {
  sessions: Session[];
  subjects: string[];
  today: DateKey;
  days: number;
  selected: DateKey | null;
  onSelect: (d: DateKey) => void;
  center?: React.ReactNode;
}

export function SeasonRings({ sessions, subjects, today, days, selected, onSelect, center }: Props) {
  const inner = 46;
  const outer = 172;
  const step = (outer - inner) / (days - 1);
  const byDay = new Map<DateKey, Session[]>();
  for (const s of sessions) {
    if (s.deletedAt || s.phase !== "focus" || s.actualSeconds <= 0 || s.status === "cancelled") continue;
    const list = byDay.get(s.localDate);
    if (list) list.push(s);
    else byDay.set(s.localDate, [s]);
  }
  const rings = Array.from({ length: days }, (_, i) => ({ date: addDays(today, -(days - 1 - i)), r: inner + i * step }));

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px] select-none">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Study sessions over the last ${days} days, one ring per day`} className="h-full w-full">
        {[0, 6, 12, 18].map((h) => {
          const a = ((h * 60) / 1440) * 2 * Math.PI - Math.PI / 2;
          return (
            <g key={h}>
              <line x1={C + inner * Math.cos(a)} y1={C + inner * Math.sin(a)} x2={C + (outer + 6) * Math.cos(a)} y2={C + (outer + 6) * Math.sin(a)} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 4" />
              <text x={C + (outer + 18) * Math.cos(a)} y={C + (outer + 18) * Math.sin(a)} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="var(--muted)">
                {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
              </text>
            </g>
          );
        })}
        {rings.map(({ date, r }) => {
          const isSel = date === selected;
          return (
            <g key={date}>
              <circle cx={C} cy={C} r={r} fill="none" stroke={isSel ? "var(--ink)" : "var(--surface-2)"} strokeWidth={isSel ? 1.4 : 1} />
              {(byDay.get(date) ?? []).map((s) => (
                <path
                  key={s.id} d={arcPath(r, minutesOfDay(s.timestamp, s.tz), Math.max(6, s.actualSeconds / 60))} fill="none"
                  stroke={subjectColor(s.subject, subjects)} strokeWidth={Math.min(step - 0.8, 3.6)} strokeLinecap="butt"
                  opacity={s.status === "completed" ? 0.95 : 0.45}
                />
              ))}
              <circle
                cx={C} cy={C} r={r} fill="none" stroke="transparent" strokeWidth={step} className="cursor-pointer"
                onClick={() => onSelect(date)} role="button" tabIndex={-1} aria-label={formatDateKey(date)}
              />
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex w-[20%] flex-col items-center text-center">{center}</div>
      </div>
    </div>
  );
}
