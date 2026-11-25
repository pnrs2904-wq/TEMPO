import Link from "next/link";
import { FreeAccessBanner } from "@/components/FreeAccessBanner";
import { HeroRing, MarketingShell } from "@/components/Marketing";

const faqs = [
  { q: "How is Tempo different from a Pomodoro timer?", a: "A Pomodoro timer gives everyone the same 25 minutes. Tempo starts from the energy you report, then adjusts in 5-minute steps using your own feedback on your last three completed sessions in that subject: whether the length felt right, how hard the material was, how often you were pulled away, and how well you focused. It always stays between 10 and 50 minutes." },
  { q: "Can I see why it recommended a particular length?", a: "Yes. Every recommendation has a “show working” view that lists the starting point, each adjustment and the rule behind it, like an itemised bill. If Tempo holds your session length steady even though you said it felt short, it tells you which signal caused that." },
  { q: "Does it work offline?", a: "Yes. Tempo installs to your phone’s home screen and stores sessions on the device. The timer, recommendations, exam plan and analytics all work with no connection. Sessions recorded offline are merged safely when you next sync." },
  { q: "Do I need an account?", a: "No. The free plan runs entirely on your device without signing in. An account is only needed for cloud backup, syncing between devices, AI reflections and coaching groups." },
  { q: "Which exams does it support?", a: "There are ready-made subject lists for UPSC Civil Services, State PSC, SSC, banking exams and GATE, plus university exams and a custom option where you name the exam and add your own subjects." },
  { q: "Is the AI required?", a: "No. AI reflections are optional and switched off by default. A short on-device reflection is always available and sends nothing anywhere." },
  { q: "What can my coaching institute see?", a: "By default, only group totals. Your own totals are visible to staff only if you switch that on yourself, and you can switch it off again. Your notes, subjects and individual sessions are never visible to an institute." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication", name: "Tempo", applicationCategory: "EducationalApplication", operatingSystem: "Web, Android, iOS",
      description: "An intelligent focus timer that adapts to your energy, subject and actual study performance.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "INR" },
        { "@type": "Offer", name: "Tempo Pro (monthly)", price: "49", priceCurrency: "INR" },
        { "@type": "Offer", name: "Annual Pro", price: "399", priceCurrency: "INR" },
        { "@type": "Offer", name: "Lifetime launch licence", price: "699", priceCurrency: "INR" },
      ],
    },
    { "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

export default function Landing() {
  return (
    <MarketingShell>
      <FreeAccessBanner className="mt-4" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <section className="grid items-center gap-10 pb-10 pt-6 md:grid-cols-2 md:pt-14">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">For UPSC, State PSC, SSC, banking, GATE and university exams</p>
          <h1 className="font-display mt-3 text-[clamp(2.4rem,7vw,4rem)] leading-[1.05]">An intelligent focus timer that adapts to your energy, subject and actual study performance.</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-2">
            Tell Tempo how you feel and what you are studying. It suggests a session length from your own history in that subject, shows its working, and adjusts gently as you go.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/app" className="inline-flex min-h-12 items-center rounded-full bg-ink px-7 text-base font-semibold text-bg">Start a session, free</Link>
            <Link href="/pricing" className="inline-flex min-h-12 items-center rounded-full border border-line px-6 text-base font-semibold">See plans</Link>
          </div>
          <p className="mt-3 text-sm text-muted">No account needed. Works offline. Installs to your home screen.</p>
        </div>
        <HeroRing />
      </section>

      <section className="grid gap-4 border-t border-line py-12 md:grid-cols-3" aria-label="How Tempo adapts">
        {[
          ["It starts with your energy", "Rate your energy from 1 to 5. Low energy starts you at 15 minutes, high energy at 45. No fixed 25-minute blocks."],
          ["It learns each subject separately", "Polity at high energy and Quant at low energy have their own history. Three completed sessions in a subject are enough for Tempo to use that subject’s pattern."],
          ["It moves five minutes at a time", "“Too short” twice in three sessions adds 5 minutes. Hard material or frequent interruptions hold it steady. Low focus takes 5 minutes off. Never below 10, never above 50."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-2xl leading-tight">{t}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{d}</p>
          </div>
        ))}
      </section>

      <section className="grid items-center gap-8 border-t border-line py-12 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl leading-tight">Every recommendation shows its working</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Tempo does not ask you to trust a black box. Open any recommendation to see the starting point, each adjustment, and which of your own answers caused it.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 font-mono text-[13px]">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Why 30 minutes</p>
          {[["Middle value of your last 3 Economy sessions (25, 25, 30 min)", "25"], ["You said “too short” 2 of 3 times", "+5"]].map(([l, v]) => (
            <div key={l} className="flex justify-between gap-4 py-1.5"><span className="font-sans text-ink-2">{l}</span><span>{v}</span></div>
          ))}
          <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold"><span className="font-sans">Recommended</span><span>30 min</span></div>
        </div>
      </section>

      <section className="border-t border-line py-12">
        <h2 className="font-display text-4xl leading-tight">Built around an exam, not just a timer</h2>
        <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {[
            ["Exam countdown and daily target", "Set your exam date and weekly minutes per subject. Tempo spreads them over the days you choose to study and shows what is left today."],
            ["Syllabus and revision calendar", "Tick topics as you cover them. Each one returns for revision after 1, 3, 7, 14 and 30 days, and the schedule stops before exam day."],
            ["Mock test tracking", "Run mocks at full paper length, log the score, and watch the percentage trend. Mocks never distort your study-session recommendations."],
            ["Your day as a ring", "Sessions appear on a 24-hour dial. Zoom out to four weeks of rings and the times of day that keep working for you line up."],
            ["Gentle by design", "A session you stop early still counts as study time and is never held against you. No red marks, no guilt, no leaderboard."],
            ["Private by default", "Your data lives on your device. Export it or delete it whenever you like. AI is optional and off until you turn it on."],
          ].map(([t, d]) => (
            <div key={t}><h3 className="text-base font-semibold">{t}</h3><p className="mt-1 text-[15px] leading-relaxed text-ink-2">{d}</p></div>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-12">
        <h2 className="font-display text-4xl leading-tight">Questions</h2>
        <div className="mt-5 divide-y divide-line">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold">{f.q}<span className="text-muted transition group-open:rotate-45">+</span></summary>
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-ink px-6 py-12 text-center text-bg">
        <h2 className="font-display text-4xl leading-tight">Your next session is one tap away</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] opacity-80">Free to use. No sign-up. Pro from ₹49 a month if you want backup, sync and more.</p>
        <Link href="/app" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-bg px-7 text-base font-semibold text-ink">Open Tempo</Link>
      </section>
    </MarketingShell>
  );
}
