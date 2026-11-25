import type { Metadata } from "next";
import Link from "next/link";
import { BuyButton } from "@/components/BuyButton";
import { MarketingShell } from "@/components/Marketing";
import { FEATURES, PLANS, formatRupees } from "@/domain/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Tempo is free to use. Pro adds cloud backup, sync, the revision calendar and optional AI reflections from ₹199 a month, ₹1,499 a year, or ₹3,999 once.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing() {
  const price = { m: PLANS.pro_monthly.defaultPaise, y: PLANS.pro_annual.defaultPaise, l: PLANS.lifetime.defaultPaise };
  const free = ["Adaptive, subject-aware timer", "“Show working” for every recommendation", "Exam countdown, subject goals, mock tracking", `Patterns for the last ${FEATURES.free.analyticsHistoryDays} days`, "Works offline, no account needed", "Export and delete your data"];
  const pro = ["Everything in Free", "Cloud backup and sync across devices", "Full history in Patterns", "Spaced revision calendar", `Optional AI reflections (${FEATURES.pro.aiMonthlyQuota} a month)`];
  return (
    <MarketingShell>
      <section className="pb-6 pt-8 text-center">
        <h1 className="font-display text-[clamp(2.4rem,6vw,3.5rem)] leading-tight">Free to study. Pro when you want more.</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-ink-2">The timer and its adaptive engine are free and stay free. Pay by UPI, card or netbanking.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="Plans">
        <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Free</h2>
          <p className="font-display mt-2 text-4xl">₹0</p>
          <p className="text-xs text-muted">for as long as you like</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">{free.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link href="/app" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-bg px-5 text-sm font-semibold">Open Tempo</Link>
        </div>

        <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{PLANS.pro_monthly.name}</h2>
          <p className="font-display mt-2 text-4xl">{formatRupees(price.m)}</p>
          <p className="text-xs text-muted">per month</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">{pro.map((f) => <li key={f}>{f}</li>)}</ul>
          <div className="mt-5"><BuyButton plan="pro_monthly" label="Get Pro monthly" variant="outline" /></div>
        </div>

        <div className="flex flex-col rounded-2xl border-2 border-ink bg-surface p-5">
          <h2 className="flex items-center justify-between text-sm font-semibold">{PLANS.pro_annual.name}<span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-bg">Best for one exam cycle</span></h2>
          <p className="font-display mt-2 text-4xl">{formatRupees(price.y)}</p>
          <p className="text-xs text-muted">per year · about {formatRupees(Math.round(price.y / 12 / 100) * 100)} a month</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">{pro.map((f) => <li key={f}>{f}</li>)}</ul>
          <div className="mt-5"><BuyButton plan="pro_annual" label="Get Annual Pro" /></div>
        </div>

        <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{PLANS.lifetime.name}</h2>
          <p className="font-display mt-2 text-4xl">{formatRupees(price.l)}</p>
          <p className="text-xs text-muted">once</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">
            <li>Everything in Free</li><li>Cloud backup and sync, for good</li><li>Full history and revision calendar</li>
            <li>AI reflections ({FEATURES.lifetime.aiMonthlyQuota} a month)</li>
          </ul>
          <div className="mt-5"><BuyButton plan="lifetime" label="Buy lifetime" variant="outline" /></div>
        </div>
      </section>

      <section className="mt-10 max-w-2xl space-y-4 text-sm leading-relaxed text-ink-2">
        <h2 className="font-display text-2xl text-ink">The small print, in plain words</h2>
        <p><strong className="text-ink">Monthly and annual plans are fixed-term passes by default.</strong> You pay once for 31 or 366 days and nothing renews unless you choose to buy again. Buying again before your pass ends adds to the time you have left.</p>
        <p><strong className="text-ink">If your plan ends,</strong> the app keeps working on your device with everything you recorded. Cloud sync pauses, and you can still download or delete what is stored on our servers.</p>
        <p><strong className="text-ink">The lifetime licence</strong> covers Tempo’s Pro features for as long as the product is offered. It includes the same monthly AI allowance as Pro.</p>
        <p><strong className="text-ink">On Android,</strong> Pro is bought through Google Play at Play’s prices. Pro bought on either platform works on both with the same account.</p>
        <p><strong className="text-ink">Payments</strong> on the web are processed by Razorpay. Tempo never sees or stores your card or UPI details.</p>
      </section>
    </MarketingShell>
  );
}
