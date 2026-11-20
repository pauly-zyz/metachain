"use client";
import type { ReactNode } from "react";

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="panel brackets p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-ink-line pb-4">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-white">{title}</h2>
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
    primary: "btn-plasma !px-4 !py-2 !text-xs",
    secondary: "btn-ghost !px-4 !py-2 !text-xs",
    danger: "inline-flex items-center border border-bad/60 bg-bad/10 px-4 py-2 font-display text-xs uppercase tracking-wide2 text-bad hover:bg-bad/20",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-line/60 py-2.5 text-sm last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-wide2 text-bone-mute">{label}</span>
      <span className="text-right font-mono text-bone break-all">{children}</span>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="panel p-5">
      <div className="hud">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="hud mt-1 text-bone-dim">{hint}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = {
    good: "border-good/40 text-good",
    warn: "border-warn/40 text-warn",
    bad: "border-bad/40 text-bad",
    neutral: "border-ink-line text-bone-dim",
  }[tone];
  return <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide2 ${cls}`}>{children}</span>;
}

export function Notice({ tone = "neutral", children }: { tone?: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = {
    good: "border-good/40 bg-good/5 text-good",
    warn: "border-warn/40 bg-warn/5 text-amber",
    bad: "border-bad/40 bg-bad/5 text-bad",
    neutral: "border-ink-line bg-ink-soft text-bone-dim",
  }[tone];
  return <div className={`border-l-2 border px-4 py-3 text-sm break-words ${cls}`}>{children}</div>;
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
      <span className="font-mono text-[11px] uppercase tracking-wide2 text-bone-dim">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full border border-ink-line bg-ink-deep px-3 py-2.5 font-mono text-bone outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(8,102,255,0.12)]"
      />
      {hint && <span className="mt-1 block text-xs text-bone-mute">{hint}</span>}
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
