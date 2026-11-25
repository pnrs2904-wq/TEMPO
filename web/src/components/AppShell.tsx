"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { init, useTempo } from "@/lib/client/store";
import { cx } from "./ui";

const TABS = [
  { href: "/app", label: "Focus", icon: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2" },
  { href: "/app/patterns", label: "Patterns", icon: "M4 19V10M10 19V5M16 19v-7M21 19H3" },
  { href: "/app/exam", label: "Exam", icon: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" },
  { href: "/app/history", label: "History", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/app/settings", label: "You", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { ready, sync, signedIn, timer } = useTempo();

  useEffect(() => {
    void init();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  const syncLabel = !signedIn ? "On this device" : sync.status === "syncing" ? "Syncing" : sync.status === "offline" ? "Offline" : sync.status === "error" ? "Sync paused" : sync.status === "local" ? "On this device" : "Synced";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <header className="flex items-center justify-between px-5 pb-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href="/app" className="font-display text-xl">Tempo</Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}
              className={cx("rounded-full px-4 py-2 text-sm font-medium", active(t.href) ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface")}>
              {t.label}
            </Link>
          ))}
        </nav>
        <span className="flex items-center gap-1.5 text-xs text-muted" title={sync.message ?? undefined}>
          <span className={cx("h-1.5 w-1.5 rounded-full", sync.status === "error" ? "bg-ochre" : sync.status === "offline" ? "bg-muted" : "bg-green")} />
          {syncLabel}
        </span>
      </header>

      <main className="flex-1 px-5 pb-28 pt-3 md:pb-10">
        {ready ? children : <p className="pt-24 text-center text-sm text-muted">Opening your study log…</p>}
      </main>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={active(t.href) ? "page" : undefined}
                className={cx("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active(t.href) ? "text-ink" : "text-muted")}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active(t.href) ? 2.1 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>
                {t.label}
                {t.href === "/app" && timer && !active(t.href) && <span className="absolute right-[28%] top-2 h-2 w-2 rounded-full bg-terra" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
