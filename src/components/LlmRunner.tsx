"use client";

import { useRef, useState } from "react";
import type { ToolComponentProps } from "@/tools/types";

const MAX_INPUT = 20_000;

export function LlmRunner({ tool }: ToolComponentProps) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const tooLong = input.length > MAX_INPUT;

  async function run() {
    if (!input.trim() || status === "running" || tooLong) return;
    setStatus("running");
    setOutput("");
    setErrorMsg(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, input }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      // The server streams newline-delimited JSON events.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { type: string; text?: string; message?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "delta" && evt.text) {
            setOutput((prev) => prev + evt.text);
          } else if (evt.type === "error") {
            throw new Error(evt.message || "The assistant returned an error.");
          }
        }
      }
      setStatus("idle");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus("idle");
        return;
      }
      setErrorMsg((e as Error).message);
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
          }}
          placeholder={tool.placeholder ?? "Enter your input…"}
          className="h-44 w-full resize-y rounded-lg border border-neutral-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className={tooLong ? "text-red-600 dark:text-red-400" : ""}>
            {input.length.toLocaleString()} / {MAX_INPUT.toLocaleString()} chars
          </span>
          <span>⌘/Ctrl + Enter to run</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {status === "running" ? (
          <button
            onClick={stop}
            className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-600"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={run}
            disabled={!input.trim() || tooLong}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run with Claude
          </button>
        )}
        {status === "running" && (
          <span className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Thinking…
          </span>
        )}
        <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          model: {tool.model}
        </span>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {output && (
        <div className="flex flex-col gap-2">
          <div className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed dark:border-neutral-800 dark:bg-neutral-950">
            {output}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(output)}
            className="w-fit rounded-md bg-neutral-200 px-3 py-1 text-sm font-medium text-neutral-800 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            Copy output
          </button>
        </div>
      )}
    </div>
  );
}
