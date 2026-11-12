"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Small shared UI building blocks for the JWT tool
// ---------------------------------------------------------------------------

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="rounded-md bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-800 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export function MiniButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-800 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
    >
      {children}
    </button>
  );
}

/** A JSON (or plain text) editor with Copy / Paste / Clear and an error line. */
export function TextArea({
  label,
  value,
  onChange,
  error,
  placeholder,
  rows = 6,
  mono = true,
  readOnly = false,
  extraButtons,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  error?: string | null;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  readOnly?: boolean;
  extraButtons?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {extraButtons}
          <CopyButton text={value} />
          {!readOnly && onChange && (
            <>
              <MiniButton
                onClick={async () => {
                  try {
                    const t = await navigator.clipboard.readText();
                    onChange(t);
                  } catch {
                    /* clipboard blocked */
                  }
                }}
              >
                Paste
              </MiniButton>
              <MiniButton onClick={() => onChange("")}>Clear</MiniButton>
            </>
          )}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        rows={rows}
        spellCheck={false}
        aria-label={label}
        className={`w-full resize-y rounded-lg border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-neutral-900 ${
          mono ? "font-mono text-xs" : ""
        } ${
          error
            ? "border-red-400 dark:border-red-700"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      />
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

const PART_CLASSES = [
  "text-rose-600 dark:text-rose-400",
  "text-fuchsia-600 dark:text-fuchsia-400",
  "text-sky-600 dark:text-sky-400",
];

/** Colour-coded header.payload.signature display. */
export function TokenParts({ token }: { token: string }) {
  const parts = token.split(".");
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950">
      {parts.map((p, i) => (
        <span key={i}>
          <span className={PART_CLASSES[i] ?? "text-neutral-500"}>{p}</span>
          {i < parts.length - 1 && <span className="text-neutral-400">.</span>}
        </span>
      ))}
    </pre>
  );
}

export function Notice() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <span>🔒</span>
        <span>
          <strong>Processed locally.</strong> Your tokens, secrets and keys never
          leave your browser — no network requests are made.
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <span>⚠️</span>
        <span>
          Never paste real production keys, secrets or tokens into any online
          tool — even one running locally in a browser.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time helpers (UTC)
// ---------------------------------------------------------------------------

export function unixToDatetimeLocal(sec: number): string {
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function datetimeLocalToUnix(value: string): number | undefined {
  if (!value) return undefined;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  return Math.floor(Date.UTC(y, mo - 1, d, h, mi) / 1000);
}

export function formatUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace(".000", "");
}

export function relativeTime(sec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = sec - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "min"],
    [1, "sec"],
  ];
  let text = "just now";
  for (const [s, name] of units) {
    if (abs >= s) {
      const n = Math.floor(abs / s);
      text = `${n} ${name}${n !== 1 ? "s" : ""}`;
      break;
    }
  }
  if (text === "just now") return text;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
