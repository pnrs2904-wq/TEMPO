"use client";
/**
 * The day ring: a 24-hour dial with midnight at the top.
 * Every session is an arc at the time of day it happened. Colour is the subject, thickness is the
 * energy the student reported, and an arc that was ended early is drawn open and lighter rather
 * than in a warning colour. The recommendation appears as a dashed "ghost" arc starting at now.
 */
import type { ReactNode } from "react";
import { minutesOfDay } from "@/domain/time";
import type { Session } from "@/domain/types";
import { subjectColor } from "@/lib/subjectColor";

const SIZE = 400;
const C = SIZE / 2;
const R = 148;
const R_BREAK = 124;

const angle = (minutes: number) => (minutes / 1440) * 360 - 90;
const point = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)] as const;
};

export function arcPath(r: number, startMin: number, lengthMin: number): string {
  const len = Math.min(1439.9, Math.max(0.5, lengthMin));
  const a0 = angle(startMin);
  const a1 = angle(startMin + len);
  const [x0, y0] = point(r, a0);
  const [x1, y1] = point(r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export const energyWidth = (energy: number) => 7 + Math.min(5, Math.max(1, energy)) * 2.6;

export interface GhostArc {
  startMin: number;
  minutes: number;
  energy: number;
  color: string;
}

export interface LiveArc extends GhostArc {
  elapsedMin: number;
  paused: boolean;
}

interface Props {
  sessions: Session[];
  subjects: string[];
  nowMin: number | null;
  ghost?: GhostArc | null;
  live?: LiveArc | null;
  liveSessionId?: string | null;
  children?: ReactNode;
  label: string;
}

export function Ring({ sessions, subjects, nowMin, ghost, live, liveSessionId, children, label }: Props) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px] select-none">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="h-full w-full">
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={22} />
        <circle cx={C} cy={C} r={R_BREAK} fill="none" stroke="var(--surface)" strokeWidth={4} />

        {hours.map((h) => {
          const major = h % 6 === 0;
          const [x0, y0] = point(R + 15, angle(h * 60));
          const [x1, y1] = point(R + (major ? 23 : 19), angle(h * 60));
          return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? "var(--ink-2)" : "var(--line)"} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = point(R + 37, angle(h * 60));
          return (
            <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="var(--muted)" className="tnum">
              {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
            </text>
          );
        })}

        {sessions
          .filter((s) => !s.deletedAt && s.id !== liveSessionId && s.status !== "cancelled" && s.actualSeconds > 0)
          .map((s) => {
            const start = minutesOfDay(s.timestamp, s.tz);
            const mins = Math.max(2.5, s.actualSeconds / 60);
            if (s.phase === "break") {
              return <path key={s.id} d={arcPath(R_BREAK, start, mins)} fill="none" stroke="var(--muted)" strokeWidth={4} strokeLinecap="round" opacity={0.55} />;
            }
            const done = s.status === "completed";
            const [ex, ey] = point(R, angle(start + mins));
            return (
              <g key={s.id}>
                <path
                  d={arcPath(R, start, mins)} fill="none" stroke={subjectColor(s.subject, subjects)} strokeWidth={energyWidth(s.energy)}
                  strokeLinecap={done ? "round" : "butt"} opacity={done ? 0.95 : 0.5}
                />
                {!done && <circle cx={ex} cy={ey} r={energyWidth(s.energy) / 2} fill="var(--bg)" stroke={subjectColor(s.subject, subjects)} strokeWidth={1.5} opacity={0.8} />}
              </g>
            );
          })}

        {ghost && (
          <path
            className="ring-ghost" d={arcPath(R, ghost.startMin, ghost.minutes)} fill="none" stroke={ghost.color}
            strokeWidth={energyWidth(ghost.energy)} strokeLinecap="round" strokeDasharray={`0.1 ${energyWidth(ghost.energy) + 5}`} style={{ transition: "stroke-width .25s" }}
          />
        )}

        {live && (
          <g>
            <path d={arcPath(R, live.startMin, live.minutes)} fill="none" stroke={live.color} strokeWidth={energyWidth(live.energy)} strokeLinecap="round" opacity={0.22} />
            {live.elapsedMin > 0.05 && (
              <path d={arcPath(R, live.startMin, live.elapsedMin)} fill="none" stroke={live.color} strokeWidth={energyWidth(live.energy)} strokeLinecap="round" opacity={live.paused ? 0.55 : 1} />
            )}
          </g>
        )}

        {nowMin !== null && !live && (
          <g>
            {(() => {
              const [x0, y0] = point(R - 17, angle(nowMin));
              const [x1, y1] = point(R + 13, angle(nowMin));
              return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />;
            })()}
          </g>
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex w-[58%] flex-col items-center text-center">{children}</div>
      </div>
    </div>
  );
}
