"use client";

import { useCallback } from "react";
import { useClaudeStream } from "@/components/useClaudeStream";
import { useHistory } from "@/components/useHistory";

interface RunOptions {
  /**
   * What to record in history as the "input" — defaults to the sent input.
   * Lets tools store the human-meaningful source (e.g. the raw text) rather
   * than a composed prompt with instructions baked in.
   */
  historyInput?: string;
  meta?: Record<string, unknown>;
}

/**
 * Shared behaviour for every LLM tool: streams a run via /api/claude and, on a
 * successful completion, records it to the server-side history/audit log. The
 * returned `history` object drives the HistoryPanel.
 */
export function useLlmTool(toolId: string) {
  const stream = useClaudeStream(toolId);
  const history = useHistory(toolId);

  const run = useCallback(
    async (sendInput: string, opts: RunOptions = {}) => {
      const output = await stream.run(sendInput);
      if (output && output.trim()) {
        await history.save({
          input: opts.historyInput ?? sendInput,
          output,
          meta: opts.meta,
        });
      }
      return output;
    },
    [stream, history],
  );

  return {
    output: stream.output,
    status: stream.status,
    error: stream.error,
    stop: stream.stop,
    run,
    history,
  };
}
