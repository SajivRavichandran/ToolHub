"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/tools/types";

export function WordCounter(_props: ToolComponentProps) {
  const [text, setText] = useState("");

  const stats = useMemo(() => {
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, "").length;
    const words = (text.trim().match(/\S+/g) ?? []).length;
    const sentences = (text.match(/[^.!?]+[.!?]+/g) ?? []).length;
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean).length;
    const readingMinutes = words / 200; // ~200 wpm
    return { chars, charsNoSpaces, words, sentences, paragraphs, readingMinutes };
  }, [text]);

  const cards: { label: string; value: string }[] = [
    { label: "Words", value: stats.words.toLocaleString() },
    { label: "Characters", value: stats.chars.toLocaleString() },
    { label: "Chars (no spaces)", value: stats.charsNoSpaces.toLocaleString() },
    { label: "Sentences", value: stats.sentences.toLocaleString() },
    { label: "Paragraphs", value: stats.paragraphs.toLocaleString() },
    {
      label: "Reading time",
      value:
        stats.readingMinutes < 1
          ? "< 1 min"
          : `${Math.round(stats.readingMinutes)} min`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Start typing or paste text to analyze…"
        className="h-48 w-full resize-y rounded-lg border border-neutral-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
