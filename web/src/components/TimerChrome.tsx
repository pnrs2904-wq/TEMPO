"use client";
/**
 * Pomotroid-inspired timer chrome for the web (ideas from Pomotroid, MIT; code written for Tempo):
 *   - the tab title shows the countdown, like Pomotroid's tray tooltip;
 *   - the favicon becomes a progress arc, like Pomotroid's dynamic tray icon;
 *   - a floating mini timer stays above other windows (Document Picture-in-Picture, Chromium 116+),
 *     the browser's equivalent of Pomotroid's "always on top" compact mode.
 */
import { useEffect, useRef, useState } from "react";
import { formatTimerDisplay, remainingSeconds, type ActiveTimer } from "@/domain/timer";
import { Button } from "./ui";

const BASE_TITLE = "Tempo";

function drawFavicon(progress: number, phase: "focus" | "break", paused: boolean): string {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (!g) return "";
  g.lineCap = "round";
  g.lineWidth = 10;
  g.strokeStyle = "#e5ddd1";
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = paused ? "#8a847c" : phase === "focus" ? "#c24f33" : "#356b88";
  g.beginPath(); g.arc(32, 32, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0.02, progress))); g.stroke();
  return c.toDataURL("image/png");
}

export function useTimerChrome(timer: ActiveTimer | null, now: number) {
  const original = useRef<string | null>(null);
  const lastSecond = useRef(-1);
  useEffect(() => {
    if (typeof document === "undefined") return;
    let link = document.querySelector<HTMLLinkElement>("link#tempo-dynamic-icon");
    if (!timer) {
      document.title = BASE_TITLE;
      link?.remove();
      return;
    }
    const remaining = remainingSeconds(timer, now || Date.now());
    if (remaining === lastSecond.current) return;
    lastSecond.current = remaining;
    document.title = `${timer.state === "PAUSED" ? "⏸ " : ""}${formatTimerDisplay(remaining)} · ${timer.phase === "break" ? "Break" : timer.subject || "Focus"}`;
    if (original.current === null) original.current = BASE_TITLE;
    if (!link) {
      link = document.createElement("link");
      link.id = "tempo-dynamic-icon";
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = drawFavicon(1 - remaining / timer.plannedSeconds, timer.phase, timer.state === "PAUSED");
  }, [timer, now]);
  useEffect(() => () => { document.title = BASE_TITLE; document.querySelector("link#tempo-dynamic-icon")?.remove(); }, []);
}

interface PipWindow extends Window { document: Document }
interface DocumentPictureInPicture { requestWindow(opts?: { width?: number; height?: number }): Promise<PipWindow>; window: PipWindow | null }

/** Opens a small always-on-top window that mirrors the countdown. Hidden where unsupported. */
export function MiniTimerButton({ timer, now, label }: { timer: ActiveTimer | null; now: number; label: string }) {
  const [supported, setSupported] = useState(false);
  const pip = useRef<PipWindow | null>(null);
  useEffect(() => setSupported(typeof window !== "undefined" && "documentPictureInPicture" in window), []);

  useEffect(() => {
    const w = pip.current;
    if (!w || w.closed) return;
    const el = w.document.getElementById("t");
    const sub = w.document.getElementById("s");
    if (el) el.textContent = timer ? formatTimerDisplay(remainingSeconds(timer, now || Date.now())) : "--:--";
    if (sub) sub.textContent = timer ? `${timer.state === "PAUSED" ? "Paused · " : ""}${label}` : "No session running";
  }, [timer, now, label]);

  if (!supported) return null;
  return (
    <Button variant="quiet" className="min-h-9 px-3 text-xs" onClick={async () => {
      const api = (window as unknown as { documentPictureInPicture: DocumentPictureInPicture }).documentPictureInPicture;
      try {
        const w = await api.requestWindow({ width: 220, height: 130 });
        w.document.body.style.cssText = "margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:Georgia,serif;background:#faf7f2;color:#1c1917";
        w.document.body.innerHTML = '<div id="t" style="font-size:46px;font-variant-numeric:tabular-nums;line-height:1">--:--</div><div id="s" style="font:12px system-ui;color:#57534e;margin-top:6px"></div>';
        pip.current = w;
      } catch { /* the user closed it or the browser refused */ }
    }}>Mini timer</Button>
  );
}
