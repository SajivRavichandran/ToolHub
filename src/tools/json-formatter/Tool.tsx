"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/tools/types";

export function JsonFormatter(_props: ToolComponentProps) {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState(2);

  const { output, error } = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { output: "", error: null as string | null };
    try {
      const parsed = JSON.parse(trimmed);
      return { output: JSON.stringify(parsed, null, indent), error: null };
    } catch (e) {
      return { output: "", error: (e as Error).message };
    }
  }, [input, indent]);

  const minified = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return "";
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      return "";
    }
  }, [input]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-600 dark:text-neutral-300">
          Indent:
          <select
            value={indent}
            onChange={(e) => setIndent(Number(e.target.value))}
            className="ml-2 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
            <option value={0}>Minified</option>
          </select>
        </label>
        {output && (
          <CopyButton
            label="Copy result"
            text={indent === 0 ? minified : output}
          />
        )}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='Paste JSON here, e.g. {"hello":"world"}'
        spellCheck={false}
        className="h-48 w-full resize-y rounded-lg border border-neutral-300 bg-white p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Invalid JSON: {error}
        </div>
      ) : (
        (indent === 0 ? minified : output) && (
          <pre className="max-h-[50vh] overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-sm dark:border-neutral-800 dark:bg-neutral-950">
            {indent === 0 ? minified : output}
          </pre>
        )
      )}
    </div>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded-md bg-neutral-200 px-3 py-1 text-sm font-medium text-neutral-800 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
