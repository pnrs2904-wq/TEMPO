/**
 * Plans and entitlements.
 *
 * Prices shown here must equal SERVER_PRICES in src/lib/server/config.mjs (a unit test checks).
 * The amount actually charged always comes from the server; the client never sends an amount.
 */
export type PlanId = "pro_monthly" | "pro_annual" | "lifetime";
export type Tier = "free" | "pro" | "lifetime";

export interface PlanInfo {
  id: PlanId;
  name: string;
  defaultPaise: number;
  /** Days of access per purchase; null = no expiry. */
  periodDays: number | null;
  unit: string;
  blurb: string;
}

export const PLANS: Record<PlanId, PlanInfo> = {
  pro_monthly: { id: "pro_monthly", name: "Tempo Pro", defaultPaise: 19900, periodDays: 31, unit: "/month", blurb: "Everything in Pro, month to month." },
  pro_annual: { id: "pro_annual", name: "Annual Pro", defaultPaise: 149900, periodDays: 366, unit: "/year", blurb: "A full preparation cycle for less than a month of coaching notes." },
  lifetime: { id: "lifetime", name: "Lifetime launch licence", defaultPaise: 399900, periodDays: null, unit: "once", blurb: "Pay once. Pro features for as long as Tempo is offered." },
};

export interface Features {
  /** Cloud backup and multi-device sync. */
  sync: boolean;
  aiReflections: boolean;
  /** AI reflections allowed per calendar month. */
  aiMonthlyQuota: number;
  /** Days of history shown in Patterns; null = all. */
  analyticsHistoryDays: number | null;
  revisionCalendar: boolean;
}

export const FEATURES: Record<Tier, Features> = {
  free: { sync: false, aiReflections: false, aiMonthlyQuota: 0, analyticsHistoryDays: 14, revisionCalendar: false },
  pro: { sync: true, aiReflections: true, aiMonthlyQuota: 60, analyticsHistoryDays: null, revisionCalendar: true },
  // Same allowance as Pro: the server applies one monthly quota (reflectionsHandler.mjs).
  lifetime: { sync: true, aiReflections: true, aiMonthlyQuota: 60, analyticsHistoryDays: null, revisionCalendar: true },
};

/** A row of public.entitlements. */
export interface EntitlementRow {
  plan: PlanId;
  status: "active" | "cancelled" | "expired" | "refunded";
  /** ISO timestamp; null = never expires. */
  current_period_end: string | null;
}

export interface Entitlement {
  tier: Tier;
  plan: PlanId | null;
  expiresAt: string | null;
  features: Features;
}

/**
 * Resolves what a user may use right now. A cancelled plan keeps working until its paid period
 * ends; refunded and expired rows grant nothing.
 */
export function resolveEntitlement(rows: EntitlementRow[], now: number): Entitlement {
  const valid = rows.filter((r) => {
    if (r.status !== "active" && r.status !== "cancelled") return false;
    if (r.current_period_end === null) return r.plan === "lifetime" && r.status === "active";
    return Date.parse(r.current_period_end) > now;
  });
  const lifetime = valid.find((r) => r.plan === "lifetime");
  const timed = valid
    .filter((r) => r.plan !== "lifetime")
    .sort((a, b) => Date.parse(b.current_period_end as string) - Date.parse(a.current_period_end as string))[0];

  // A running Pro period outranks lifetime because it carries the larger AI allowance.
  if (timed) return { tier: "pro", plan: timed.plan, expiresAt: timed.current_period_end, features: FEATURES.pro };
  if (lifetime) return { tier: "lifetime", plan: "lifetime", expiresAt: null, features: FEATURES.lifetime };
  return { tier: "free", plan: null, expiresAt: null, features: FEATURES.free };
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}
