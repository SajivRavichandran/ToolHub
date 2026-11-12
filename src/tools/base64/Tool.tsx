"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/tools/types";

type Mode = "encode" | "decode";

// UTF-8 safe Base64 helpers (btoa/atob are latin1-only).
function encodeUtf8Base64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function decodeUtf8Base64(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function Base64Tool(_props: ToolComponentProps) {
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("");

  const { output, error } = useMemo(() => {
    if (!input) return { output: "", error: null as string | null };
    try {
      return {
        output: mode === "encode" ? encodeUtf8Base64(input) : decodeUtf8Base64(input),
        error: null,
      };
    } catch (e) {
      return { output: "", error: (e as Error).message || "Invalid input" };
    }
  }, [input, mode]);

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
        {(["encode", "decode"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-4 py-1 text-sm font-medium capitalize transition ${
              mode === m
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={mode === "encode" ? "Text to encode…" : "Base64 to decode…"}
        spellCheck={false}
        className="h-32 w-full resize-y rounded-lg border border-neutral-300 bg-white p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : (
        output && (
          <div className="flex flex-col gap-2">
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-sm dark:border-neutral-800 dark:bg-neutral-950">
              {output}
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(output)}
              className="w-fit rounded-md bg-neutral-200 px-3 py-1 text-sm font-medium text-neutral-800 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              Copy
            </button>
          </div>
        )
      )}
    </div>
  );
}
