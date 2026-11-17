"use client";

import { useState } from "react";
import type { HistoryEntry } from "@/components/useHistory";
import { MarkdownOutput } from "@/components/MarkdownOutput";

interface HistoryPanelProps {
  entries: HistoryEntry[];
  loading: boolean;
  onReload: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** Restore a past run back into the tool's inputs. */
  onLoad: (entry: HistoryEntry) => void;
}

function relativeTime(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleString();
}

function snippet(s: string, n = 100): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export function HistoryPanel({
  entries,
  loading,
  onReload,
  onRemove,
  onClear,
  onLoad,
}: HistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copy(entry: HistoryEntry) {
    try {
      await navigator.clipboard.writeText(entry.output);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium"
      >
        <span
          className={`transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▶
        </span>
        History
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {entries.length}
        </span>
        <span className="ml-auto flex items-center gap-3 text-xs font-normal text-neutral-500 dark:text-neutral-400">
          {loading && "loading…"}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onReload();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onReload();
              }
            }}
            className="cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            Refresh
          </span>
          {entries.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Clear all history for this tool?")) onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  if (confirm("Clear all history for this tool?")) onClear();
                }
              }}
              className="cursor-pointer text-red-500 hover:text-red-600"
            >
              Clear all
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-800">
          {entries.length === 0 ? (
            <p className="px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400">
              No saved runs yet. Each successful run is recorded here.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {entries.map((entry) => {
                const expanded = expandedId === entry.id;
                return (
                  <li key={entry.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expanded ? null : entry.id)
                        }
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                          <span>{relativeTime(entry.ts)}</span>
                          {renderMetaBadges(entry.meta)}
                        </div>
                        <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
                          {snippet(entry.output || entry.input)}
                        </p>
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <ActionBtn onClick={() => onLoad(entry)}>
                        ↩ Load into input
                      </ActionBtn>
                      <ActionBtn onClick={() => copy(entry)}>
                        {copiedId === entry.id ? "✓ Copied" : "Copy output"}
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                      >
                        {expanded ? "Hide" : "View"}
                      </ActionBtn>
                      <ActionBtn danger onClick={() => onRemove(entry.id)}>
                        Delete
                      </ActionBtn>
                    </div>

                    {expanded && (
                      <div className="mt-3 flex flex-col gap-3">
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                            Input
                          </p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                            {entry.input}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                            Output
                          </p>
                          <MarkdownOutput text={entry.output} />
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function renderMetaBadges(meta?: Record<string, unknown>) {
  if (!meta) return null;
  const keys = ["tone", "formality", "length", "audience"];
  const badges = keys
    .map((k) => meta[k])
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, 3);
  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((b, i) => (
        <span
          key={i}
          className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        >
          {snippet(b, 24)}
        </span>
      ))}
    </>
  );
}

function ActionBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 transition ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}
