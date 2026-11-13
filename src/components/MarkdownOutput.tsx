"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant output as formatted Markdown (headings, bold, numbered and
 * bulleted lists, links, tables, code) with a toggle to view/copy the raw
 * Markdown source. Copy always copies the raw text so it can be pasted
 * elsewhere (e.g. into an email) unchanged.
 */
export function MarkdownOutput({ text }: { text: string }) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-neutral-300 p-0.5 text-xs dark:border-neutral-700">
          <button
            onClick={() => setRaw(false)}
            className={`rounded-md px-2 py-0.5 font-medium transition ${
              !raw
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            Rendered
          </button>
          <button
            onClick={() => setRaw(true)}
            className={`rounded-md px-2 py-0.5 font-medium transition ${
              raw
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            Raw
          </button>
        </div>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              /* clipboard blocked */
            }
          }}
          className="ml-auto rounded-md bg-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
        >
          {copied ? "Copied!" : "Copy raw"}
        </button>
      </div>

      {raw ? (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950">
          {text}
        </pre>
      ) : (
        <div className="prose prose-sm max-w-none rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:prose-invert dark:border-neutral-800 dark:bg-neutral-950 prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-900 prose-a:break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
