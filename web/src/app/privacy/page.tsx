import type { Metadata } from "next";
import { MarketingShell } from "@/components/Marketing";

export const metadata: Metadata = { title: "Privacy", description: "What Tempo stores, where it is stored, who can see it, and how to export or delete it.", alternates: { canonical: "/privacy" } };

const sections: [string, string[]][] = [
  ["Template notice", ["This page describes how the Tempo software handles data. Before launch, the operator must add their legal name, contact address and grievance officer, and have the page reviewed against the Digital Personal Data Protection Act, 2023 and its rules."]],
  ["On your device", ["Sessions (time, subject, study type, energy, ratings, notes), your exam plan and your settings are stored in your browser on your device. Without an account, nothing leaves it."]],
  ["On our servers, if you sign in", ["Your email address, for sign-in.", "With an active plan: a synced copy of your sessions, preferences and exam preparation (plans, syllabus progress, revisions, mock tests and question attempts), so you can use more than one device.", "A record of purchases (plan, amount, date, payment reference). Card and UPI details are handled by Razorpay and never reach Tempo."]],
  ["AI reflections", ["Off by default. If you turn them on, totals from your last 14 days (minutes, completion, energy and focus ratings per subject) are sent to Google Gemini through our server to write a short reflection.", "Session notes are sent only if you separately allow it; up to five, shortened, with emails, phone numbers and passwords removed first. This redaction is automatic and cannot catch everything, so avoid writing sensitive details in notes.", "We store a count of how many reflections you have requested, not their content."]],
  ["Coaching institutes", ["If you join a group, staff can see that you are a member and can see totals for the whole group.", "Staff can see your own totals only if you switch on “share my own totals”, and you can switch it off at any time.", "Staff can never see your notes, subjects or individual sessions."]],
  ["What we do not do", ["No advertising, no sale of data, no third-party analytics trackers in the app."]],
  ["Your controls", ["Export your sessions as CSV or JSON at any time from History or Settings.", "Download everything held on our servers from Settings.", "Erase the data on a device from Settings.", "Delete your account from Settings; this removes your synced sessions, exam plan, group memberships and profile from our servers."]],
  ["Children", ["Tempo is intended for students aged 18 and over. Institutes enrolling younger students are responsible for obtaining verifiable parental consent as the law requires."]],
];

export default function Privacy() {
  return (
    <MarketingShell>
      <article className="max-w-2xl py-8">
        <h1 className="font-display text-5xl">Privacy</h1>
        {sections.map(([title, items]) => (
          <section key={title} className="mt-8">
            <h2 className="font-display text-2xl">{title}</h2>
            <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-2">{items.map((i) => <li key={i}>{i}</li>)}</ul>
          </section>
        ))}
      </article>
    </MarketingShell>
  );
}
