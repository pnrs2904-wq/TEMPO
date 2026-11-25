import Link from "next/link";
import type { ReactNode } from "react";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="font-display text-2xl">Tempo</Link>
        <nav aria-label="Site" className="flex items-center gap-1 text-sm">
          <Link href="/pricing" className="rounded-full px-3 py-2 text-ink-2 hover:bg-surface">Pricing</Link>
          <Link href="/app" className="rounded-full bg-ink px-4 py-2 font-semibold text-bg">Open Tempo</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-xs text-muted">
        <p>Tempo. A focus timer for exam preparation.</p>
        <p className="flex gap-4">
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/help" className="hover:text-ink">Help</Link>
          <Link href="/delete-account" className="hover:text-ink">Delete account</Link>
        </p>
      </footer>
    </div>
  );
}

const C = 200;
const R = 148;
function arc(startMin: number, len: number, r = R) {
  const a = (m: number) => ((m / 1440) * 360 - 90) * (Math.PI / 180);
  const x0 = C + r * Math.cos(a(startMin)), y0 = C + r * Math.sin(a(startMin));
  const x1 = C + r * Math.cos(a(startMin + len)), y1 = C + r * Math.sin(a(startMin + len));
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Static illustration of the day ring for marketing pages. */
export function HeroRing() {
  const sessions = [
    { start: 390, len: 45, w: 20, c: "var(--s1)" },
    { start: 450, len: 35, w: 17.4, c: "var(--s1)" },
    { start: 600, len: 25, w: 14.8, c: "var(--s2)" },
    { start: 640, len: 25, w: 14.8, c: "var(--s3)" },
    { start: 900, len: 20, w: 12.2, c: "var(--s2)", open: true },
    { start: 1080, len: 35, w: 17.4, c: "var(--s4)" },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[400px]">
      <svg viewBox="0 0 400 400" role="img" aria-label="A 24-hour dial showing six study sessions as coloured arcs and a dashed arc for the next recommended session" className="h-full w-full">
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={22} />
        {Array.from({ length: 24 }, (_, h) => {
          const a = ((h * 60) / 1440) * 2 * Math.PI - Math.PI / 2;
          const major = h % 6 === 0;
          return <line key={h} x1={C + (R + 15) * Math.cos(a)} y1={C + (R + 15) * Math.sin(a)} x2={C + (R + (major ? 23 : 19)) * Math.cos(a)} y2={C + (R + (major ? 23 : 19)) * Math.sin(a)} stroke={major ? "var(--ink-2)" : "var(--line)"} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />;
        })}
        {sessions.map((s, i) => <path key={i} d={arc(s.start, s.len)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap={s.open ? "butt" : "round"} opacity={s.open ? 0.5 : 0.95} />)}
        <path d={arc(1230, 30)} fill="none" stroke="var(--s3)" strokeWidth={14.8} strokeLinecap="round" strokeDasharray="0.1 20" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Recommended</p>
        <p className="font-display text-7xl leading-none">30</p>
        <p className="mt-1 text-xs text-muted">minutes of Economy</p>
      </div>
    </div>
  );
}
