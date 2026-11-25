"use client";
import Link from "next/link";
import { freeAccessLastDay, useFreeAccess } from "@/lib/client/freeAccess";

/** Shown while the launch offer is open: every Pro feature is free for signed-in users. */
export function FreeAccessBanner({ className = "" }: { className?: string }) {
  const until = useFreeAccess();
  if (!until) return null;
  return (
    <div className={`rounded-2xl border-2 border-ink bg-surface px-5 py-4 text-center ${className}`} role="status">
      <p className="font-display text-xl">Launch offer: Pro is free for everyone until {freeAccessLastDay(until)}.</p>
      <p className="mt-1 text-sm text-ink-2">
        Cloud backup, sync, full history and the revision calendar are on for every account. No card, no payment.{" "}
        <Link href="/login" className="font-semibold underline">Create a free account</Link>
      </p>
    </div>
  );
}
