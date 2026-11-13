"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/tools/types";
import { useClaudeStream } from "@/components/useClaudeStream";
import { MarkdownOutput } from "@/components/MarkdownOutput";

const MAX_INPUT = 20_000;

export function LlmRunner({ tool }: ToolComponentProps) {
  const [input, setInput] = useState("");
  const { output, status, error, run, stop } = useClaudeStream(tool.id);

  const tooLong = input.length > MAX_INPUT;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !tooLong) run(input);
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
            onClick={() => run(input)}
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

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {output && <MarkdownOutput text={output} />}
    </div>
  );
}
