import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/Marketing";

export const metadata: Metadata = {
  title: "Delete your Tempo account",
  description: "How to delete your Tempo account and what is removed.",
  alternates: { canonical: "/delete-account" },
};

/** Public page required by Google Play's account-deletion policy: reachable without signing in. */
export default function DeleteAccount() {
  return (
    <MarketingShell>
      <article className="max-w-2xl py-8 text-[15px] leading-relaxed text-ink-2">
        <h1 className="font-display text-5xl text-ink">Delete your account</h1>
        <h2 className="font-display mt-8 text-2xl text-ink">In the app or on the web</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li><Link className="underline" href="/login">Sign in</Link> and open <strong>Settings</strong>.</li>
          <li>Under <strong>Account</strong>, choose <strong>Delete account</strong> and type DELETE to confirm.</li>
        </ol>
        <p className="mt-2">If you own a coaching institute, delete it or transfer it first.</p>
        <h2 className="font-display mt-8 text-2xl text-ink">If you cannot sign in</h2>
        <p className="mt-2">Email the operator&apos;s support address (shown on the <Link className="underline" href="/help">Help</Link> page) from the address on the account and ask for deletion. We confirm by email and delete within 30 days.</p>
        <h2 className="font-display mt-8 text-2xl text-ink">What is deleted</h2>
        <p className="mt-2">Your profile, synced sessions, preferences, exam plans, syllabus progress, revisions, mock tests and question attempts, group memberships and AI usage counts, all at once. Payment records are deleted from Tempo; your payment provider keeps its own records as the law requires.</p>
        <h2 className="font-display mt-8 text-2xl text-ink">What is not deleted</h2>
        <p className="mt-2">Data stored only on your devices stays there until you erase it (Settings → Erase this device) or uninstall the app. Encrypted Android backups expire on Google&apos;s schedule.</p>
      </article>
    </MarketingShell>
  );
}
