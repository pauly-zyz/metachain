"use client";
import type { ReactNode } from "react";

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-line bg-ink-soft p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-blue-500",
    secondary: "border border-ink-line bg-ink text-slate-200 hover:border-slate-500",
    danger: "bg-bad/90 text-white hover:bg-bad",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-line/60 py-2 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-mono text-slate-100 break-all">{children}</span>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-line bg-ink-soft p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-xl text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = {
    good: "bg-good/15 text-good",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    neutral: "bg-slate-500/15 text-slate-300",
  }[tone];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Notice({ tone = "neutral", children }: { tone?: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = {
    good: "border-good/40 bg-good/10 text-green-200",
    warn: "border-warn/40 bg-warn/10 text-amber-200",
    bad: "border-bad/40 bg-bad/10 text-red-200",
    neutral: "border-ink-line bg-ink text-slate-300",
  }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm break-words ${cls}`}>{children}</div>;
}

export function Field({
  label,
  value,
  onChange,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 font-mono text-slate-100 outline-none focus:border-accent"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function TxLink({ hash, explorer }: { hash?: string; explorer: string | null }) {
  if (!hash) return null;
  return explorer ? (
    <a className="text-accent underline" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
      {hash.slice(0, 10)}…
    </a>
  ) : (
    <span className="font-mono">{hash.slice(0, 10)}…</span>
  );
}
