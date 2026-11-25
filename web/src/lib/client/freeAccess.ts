"use client";
/**
 * Launch offer: Pro is free for every signed-in user until the server's `freeAccessUntil`
 * (public.app_settings.free_access_until). The server enforces it; this only drives the UI.
 */
import { useEffect, useState } from "react";

/** "31 December 2026": the last day of the offer, in India time. */
export function freeAccessLastDay(untilIso: string): string {
  return new Date(Date.parse(untilIso) - 1).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

let cached: Promise<string | null> | null = null;

function load(): Promise<string | null> {
  cached ??= fetch("/api/flags")
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { freeAccessUntil?: string | null } | null) => {
      const until = b?.freeAccessUntil ?? null;
      return until && Date.parse(until) > Date.now() ? until : null;
    })
    .catch(() => null);
  return cached;
}

/** ISO end of the launch offer while it is open, else null (also null while loading). */
export function useFreeAccess(): string | null {
  const [until, setUntil] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((u) => { if (live) setUntil(u); });
    return () => { live = false; };
  }, []);
  return until;
}
