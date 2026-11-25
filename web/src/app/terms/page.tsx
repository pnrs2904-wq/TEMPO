import type { Metadata } from "next";
import { MarketingShell } from "@/components/Marketing";

export const metadata: Metadata = { title: "Terms", description: "Terms of use for Tempo.", alternates: { canonical: "/terms" } };

const sections: [string, string][] = [
  ["Template notice", "These terms are a starting template. Before launch, the operator must add their legal name, registered address, governing law, refund policy and contact details, and have the terms reviewed by a lawyer."],
  ["The service", "Tempo is a study timer and planner. It suggests session lengths from the information you enter. It is a study aid, not academic, medical or psychological advice, and it does not promise any examination result."],
  ["Your account", "You can use Tempo without an account. If you create one, keep access to your email secure; sign-in links are sent there."],
  ["Plans and payments", "Paid plans are described on the pricing page. Monthly and annual plans are fixed-term unless you choose auto-renewal. Payments are processed by Razorpay. Refunds follow the policy the operator publishes here before launch."],
  ["Institutes", "An institute that buys seats is responsible for inviting only its own students and for using group information in line with the privacy page. Students control whether their individual totals are shared."],
  ["Acceptable use", "Do not attempt to access other people’s data, disrupt the service, or resell access without permission."],
  ["Your data", "Your study data belongs to you. You can export or delete it at any time from Settings."],
  ["Changes", "If these terms change in a way that matters, the app will tell you before the change takes effect."],
];

export default function Terms() {
  return (
    <MarketingShell>
      <article className="max-w-2xl py-8">
        <h1 className="font-display text-5xl">Terms</h1>
        {sections.map(([t, d]) => (
          <section key={t} className="mt-8"><h2 className="font-display text-2xl">{t}</h2><p className="mt-2 text-[15px] leading-relaxed text-ink-2">{d}</p></section>
        ))}
      </article>
    </MarketingShell>
  );
}
