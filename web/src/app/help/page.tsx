import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/Marketing";

export const metadata: Metadata = { title: "Help", description: "Answers to common questions about Tempo.", alternates: { canonical: "/help" } };

const faq: [string, string][] = [
  ["How does Tempo pick my session length?", "From your own history: how long you actually lasted at similar energy, with the same subject and study type, adjusted for how near your exam is and for revisions due. Tap “Show working” beside any suggestion to see every step."],
  ["What are rounds?", "Focus, short break, focus… and a long break after a set number of focus rounds (4 by default). Change it in Settings → Rounds and sounds. This cycle follows the open-source Pomotroid timer."],
  ["Are exam patterns official?", "Each exam shows Official or Provisional. Provisional means we could not confirm the current notification; check the official website linked on the exam before relying on marks, sections or weightage."],
  ["Why does CA or GATE ask for marks instead of questions?", "Their papers mix descriptive and objective questions with different marks, so counting correct answers would give a wrong score. You enter marks obtained out of the maximum."],
  ["Does it work offline?", "Yes. Everything is saved on your device first. With Pro, changes sync when you are back online; if two devices edit the same item, the later edit wins."],
  ["How do I move my data?", "Settings → Export gives you JSON and CSV files. With an account, Settings → Download my data includes everything stored on our servers."],
  ["How do I cancel Pro?", "Settings → Subscription → Cancel. You keep Pro until the end of the period you paid for. On Android, subscriptions bought through Google Play are managed in the Play Store."],
  ["How do I delete my account?", "See the account deletion page."],
];

export default function Help() {
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <MarketingShell>
      <article className="max-w-2xl py-8">
        <h1 className="font-display text-5xl">Help</h1>
        <dl className="mt-6 space-y-6">
          {faq.map(([q, a]) => (
            <div key={q}>
              <dt className="font-display text-xl">{q}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-ink-2">{q.startsWith("How do I delete") ? <>See <Link className="underline" href="/delete-account">Delete your account</Link>.</> : a}</dd>
            </div>
          ))}
        </dl>
        <h2 className="font-display mt-10 text-2xl">Contact</h2>
        <p className="mt-2 text-[15px] text-ink-2">{support ? <>Email <a className="underline" href={`mailto:${support}`}>{support}</a>.</> : "The operator has not set a support address yet (NEXT_PUBLIC_SUPPORT_EMAIL)."}</p>
      </article>
    </MarketingShell>
  );
}
