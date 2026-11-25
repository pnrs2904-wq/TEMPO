"use client";
/**
 * Starts a purchase. The browser only names the plan; the server sets the amount, and access is
 * granted only after the server verifies Razorpay's signature (see /api/billing/verify).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PLANS, type PlanId } from "@/domain/plans";
import { freeAccessLastDay, useFreeAccess } from "@/lib/client/freeAccess";
import { refreshMe, syncNow } from "@/lib/client/store";
import { accessToken, api, supabase, type ApiError } from "@/lib/client/supabase";
import { Button } from "./ui";

/** POST /api/billing/checkout: a one-time Razorpay order for the plan, priced by the server. */
interface Checkout {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  plan: PlanId;
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function BuyButton({ plan, label, variant = "primary", onDone }: {
  plan: PlanId; label: string; variant?: "primary" | "outline"; onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const freeUntil = useFreeAccess();

  async function buy() {
    setError(null);
    if (!supabase()) return setError("Payments are not set up on this deployment yet.");
    if (!(await accessToken())) return router.push("/login");
    setBusy(true);
    try {
      const c = await api<Checkout>("/api/billing/checkout", { body: { plan } });
      if (!c.keyId) throw { error: "Payments are not set up on this deployment yet. Nothing has been charged." };
      if (!(await loadRazorpay())) throw { error: "Could not load the payment window. Check your connection and try again." };
      const Razorpay = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } }).Razorpay;
      new Razorpay({
        key: c.keyId, name: "Tempo", description: PLANS[c.plan]?.name ?? "Tempo Pro", currency: c.currency,
        order_id: c.orderId, amount: c.amountPaise,
        theme: { color: "#1C1917" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: Record<string, string>) => {
          try {
            await api("/api/billing/verify", {
              body: { razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature },
            });
            await refreshMe();
            void syncNow();
            onDone ? onDone() : router.push("/app/settings");
          } catch (e) {
            setError((e as ApiError).error ?? "Payment received, but activation is delayed. It will complete automatically within a few minutes.");
          } finally {
            setBusy(false);
          }
        },
      }).open();
    } catch (e) {
      setError((e as ApiError).error ?? "Could not start the payment. Nothing has been charged.");
      setBusy(false);
    }
  }

  if (freeUntil) {
    return (
      <div>
        <Button variant={variant} className="w-full" onClick={() => router.push("/app")}>Free until {freeAccessLastDay(freeUntil)}</Button>
        <p className="mt-2 text-xs text-muted">Sign in and every Pro feature is on. No payment needed.</p>
      </div>
    );
  }

  return (
    <div>
      <Button variant={variant} className="w-full" disabled={busy} onClick={() => void buy()}>{busy ? "Opening payment…" : label}</Button>
      {error && <p className="mt-2 text-xs text-terra" role="alert">{error}</p>}
    </div>
  );
}
