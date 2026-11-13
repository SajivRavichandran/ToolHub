"use client";

import { useCallback, useRef, useState } from "react";

export type StreamStatus = "idle" | "running" | "error";

/**
 * Shared hook that POSTs to /api/claude and streams the newline-delimited JSON
 * events back, accumulating text deltas into `output`. Used by every LLM tool.
 */
export function useClaudeStream(toolId: string) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (input: string) => {
      if (!input.trim() || status === "running") return;
      setStatus("running");
      setOutput("");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolId, input }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed (${res.status})`);
        }

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
        setError((e as Error).message);
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [toolId, status],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { output, status, error, run, stop };
}
