"use client";

import { useCallback, useEffect, useState } from "react";

export interface HistoryEntry {
  id: string;
  toolId: string;
  ts: number;
  input: string;
  output: string;
  meta?: Record<string, unknown>;
}

/**
 * Client hook over the server-side /api/history store. Provides the entries for
 * a tool plus save / delete / clear operations.
 */
export function useHistory(toolId: string) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/history?toolId=${encodeURIComponent(toolId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load history");
      setEntries(data.entries ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toolId]);

  const save = useCallback(
    async (entry: {
      input: string;
      output: string;
      meta?: Record<string, unknown>;
    }) => {
      try {
        const res = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolId, ...entry }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save history");
        setEntries((prev) => [data.entry, ...prev]);
        return data.entry as HistoryEntry;
      } catch (e) {
        // History is best-effort; surface but don't break the run.
        setError((e as Error).message);
        return null;
      }
    },
    [toolId],
  );

  const remove = useCallback(
    async (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      await fetch(
        `/api/history?toolId=${encodeURIComponent(toolId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ).catch(() => {});
    },
    [toolId],
  );

  const clear = useCallback(async () => {
    setEntries([]);
    await fetch(
      `/api/history?toolId=${encodeURIComponent(toolId)}&all=1`,
      { method: "DELETE" },
    ).catch(() => {});
  }, [toolId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entries, loading, error, refresh, save, remove, clear };
}
