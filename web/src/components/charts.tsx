"use client";
/**
 * Charts. One measure per chart and one axis per chart; single-series charts use one ink colour
 * and are named by their card title, so colour never carries meaning on its own. Every chart has
 * a hover/tap tooltip and a text summary for screen readers.
 */
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Datum {
  label: string;
  value: number | null;
  note?: string;
  color?: string;
}

function Tip({ active, payload, unit }: { active?: boolean; payload?: { payload: Datum }[]; unit: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-bg px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-ink">{d.label}</p>
      <p className="tnum text-ink-2">{d.value === null ? "No data" : `${Math.round(d.value * 10) / 10} ${unit}`}</p>
      {d.note && <p className="text-muted">{d.note}</p>}
    </div>
  );
}

export function Bars({ data, unit, height = 180, domain, color = "var(--ink-2)", summary, tickEvery, ticks }: {
  data: Datum[]; unit: string; height?: number; domain?: [number, number]; color?: string; summary: string; tickEvery?: number; ticks?: number[];
}) {
  return (
    <div role="img" aria-label={summary} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={tickEvery ? tickEvery - 1 : "preserveStartEnd"} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} width={38} ticks={ticks} domain={domain ?? [0, "auto"]} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--surface-2)", opacity: 0.6 }} content={<Tip unit={unit} />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={d.color ?? color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars with the label and value printed, for ranked categories such as subjects. */
export function RankBars({ rows, unit }: { rows: { label: string; value: number; color: string; detail?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} /><span className="truncate font-medium">{r.label}</span></span>
            <span className="tnum shrink-0 text-ink-2">{r.value} {unit}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
          {r.detail && <p className="mt-1 text-xs text-muted">{r.detail}</p>}
        </li>
      ))}
    </ul>
  );
}
