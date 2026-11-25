"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-surface p-4", className)}>{children}</section>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-[11px] font-semibold uppercase tracking-[0.14em] text-muted", className)}>{children}</p>;
}

type Variant = "primary" | "outline" | "quiet" | "danger";
export function Button({ variant = "primary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-ink text-bg hover:opacity-90",
    outline: "border border-line bg-bg text-ink hover:bg-surface-2",
    quiet: "text-ink-2 hover:bg-surface-2",
    danger: "border border-terra text-terra hover:bg-terra-soft",
  };
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        styles[variant], className,
      )}
    />
  );
}

export function Segmented<T extends string>({ value, options, onChange, disabled, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}
          className={cx(
            "min-h-9 flex-1 rounded-full px-2 text-[13px] font-medium transition disabled:opacity-50",
            o.value === value ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1-5 scale. Dots grow with the value, so the control itself shows low to high. */
export function Scale({ value, onChange, label, low, high, disabled, tone = "ink" }: {
  value: number | null; onChange: (v: number) => void; label: string; low: string; high: string; disabled?: boolean; tone?: "ink" | "energy";
}) {
  const energyTone = (n: number) => (n <= 2 ? "var(--blue)" : n === 3 ? "var(--ochre)" : "var(--terra)");
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="flex items-center justify-between gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          const color = tone === "energy" ? energyTone(n) : "var(--ink)";
          return (
            <button
              key={n} type="button" role="radio" aria-checked={on} aria-label={`${label}: ${n} of 5`} disabled={disabled} onClick={() => onChange(n)}
              className="flex h-12 flex-1 items-center justify-center rounded-xl transition hover:bg-surface-2 disabled:opacity-50"
            >
              <span
                className="flex items-center justify-center rounded-full text-[13px] font-semibold tnum transition-all"
                style={{
                  width: 20 + n * 4, height: 20 + n * 4,
                  background: on ? color : "transparent", color: on ? "var(--bg)" : "var(--ink-2)",
                  border: `1.5px solid ${on ? color : "var(--line)"}`,
                }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-0.5 flex justify-between px-2 text-[11px] text-muted"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

export function Chip({ active, color, children, onClick, disabled }: { active?: boolean; color?: string; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={cx(
        "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition disabled:opacity-50",
        active ? "border-ink bg-ink text-bg" : "border-line bg-bg text-ink-2 hover:border-ink-2",
      )}
    >
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className="font-display mt-1 text-3xl leading-none tnum">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
        <h2 className="font-display text-2xl">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start justify-between gap-4 py-3", disabled && "cursor-not-allowed opacity-50")}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-surface-2 ring-1 ring-line transition peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-bg shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink placeholder:text-muted focus:border-ink-2 focus:outline-none";

export function minutesLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
