"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/tools/types";
import { useClaudeStream } from "@/components/useClaudeStream";
import { MarkdownOutput } from "@/components/MarkdownOutput";

const MAX_INPUT = 20_000;

const TONES = [
  "Professional",
  "Friendly",
  "Formal",
  "Casual",
  "Direct",
  "Diplomatic",
  "Confident",
  "Empathetic",
  "Enthusiastic",
];

const FORMALITY = ["Keep as-is", "More formal", "More casual"];
const URGENCY = ["Normal", "Urgent / time-sensitive", "Low-key / no pressure"];
const LENGTH = ["Keep similar", "More concise", "More detailed"];

const AUDIENCE_PRESETS = [
  "The direct recipient — clear and easy to understand",
  "A senior stakeholder / executive",
  "A technical peer",
  "A non-technical audience",
  "A customer / client",
  "A new team member",
];

export function RewriteRunner({ tool }: ToolComponentProps) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState(AUDIENCE_PRESETS[0]);
  const [tone, setTone] = useState("Professional");
  const [formality, setFormality] = useState(FORMALITY[0]);
  const [urgency, setUrgency] = useState(URGENCY[0]);
  const [length, setLength] = useState(LENGTH[0]);
  const [preserveFormatting, setPreserveFormatting] = useState(true);
  const [custom, setCustom] = useState("");

  const { output, status, error, run, stop } = useClaudeStream(tool.id);

  function buildPrompt(): string {
    const lines = [
      "Rewrite and polish the text below according to these preferences:",
      `- Audience: ${audience || "a general reader"}`,
      `- Tone / feel: ${tone}`,
      `- Formality: ${formality}`,
      `- Urgency: ${urgency}`,
      `- Length: ${length}`,
    ];
    if (custom.trim()) lines.push(`- Additional instructions: ${custom.trim()}`);
    lines.push("");
    lines.push(
      preserveFormatting
        ? "Preserve the original formatting exactly where possible — Markdown, numbered and bulleted lists, bold/italic, headings, links, and line breaks. Do not flatten structure into a single paragraph."
        : "You may restructure the formatting if it improves clarity for the audience.",
    );
    lines.push("Return only the rewritten text, with no preamble or commentary.");
    lines.push("");
    lines.push("===== TEXT TO REWRITE =====");
    lines.push(text);
    return lines.join("\n");
  }

  const prompt = buildPrompt();
  const tooLong = prompt.length > MAX_INPUT;

  return (
    <div className="flex flex-col gap-5">
      {/* Style controls */}
      <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <span className="text-sm font-medium">Writing style</span>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Audience</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Who is this for? e.g. a senior stakeholder"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {AUDIENCE_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className={`rounded-full border px-2 py-0.5 text-xs transition ${
                  audience === a
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Tone / feel" value={tone} onChange={setTone} options={TONES} />
          <SelectField label="Formality" value={formality} onChange={setFormality} options={FORMALITY} />
          <SelectField label="Urgency" value={urgency} onChange={setUrgency} options={URGENCY} />
          <SelectField label="Length" value={length} onChange={setLength} options={LENGTH} />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Additional instructions (optional)</span>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. keep the greeting, add a clear call to action, avoid jargon…"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={preserveFormatting}
            onChange={(e) => setPreserveFormatting(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Preserve original formatting (lists, numbering, bold, links)</span>
        </label>
      </section>

      {/* Source text */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Text to rewrite</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !tooLong) run(prompt);
          }}
          placeholder={tool.placeholder ?? "Paste the text to rewrite…"}
          className="h-52 w-full resize-y rounded-lg border border-neutral-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className={tooLong ? "text-red-600 dark:text-red-400" : ""}>
            {prompt.length.toLocaleString()} / {MAX_INPUT.toLocaleString()} chars (incl. instructions)
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
            onClick={() => run(prompt)}
            disabled={!text.trim() || tooLong}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Rewrite with Claude
          </button>
        )}
        {status === "running" && (
          <span className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Rewriting…
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
