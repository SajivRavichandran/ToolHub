import type { ToolMeta } from "@/tools/types";

export const meta: ToolMeta = {
  id: "rewrite",
  name: "Rewrite & Polish",
  description: "Improve grammar, clarity, and tone of your writing.",
  icon: "✨",
  type: "llm",
  model: "sonnet",
  placeholder: "Paste text to polish (email, message, paragraph)…",
  systemPrompt: [
    "You are an expert editor.",
    "Rewrite the user's text to improve grammar, clarity, flow, and tone,",
    "while preserving the original meaning and the author's voice.",
    "The user's message may include explicit preferences (audience, tone, formality,",
    "urgency, length, and additional instructions) — follow them precisely.",
    "CRITICAL: Preserve the original formatting and structure unless told otherwise —",
    "keep Markdown, numbered and bulleted lists, bold/italic, headings, links, tables,",
    "and line breaks intact. Never collapse a structured message into one flat paragraph,",
    "and never strip URLs or list markers.",
    "Return only the rewritten text, as Markdown, with no preamble or explanation,",
    "unless the user explicitly asks for notes.",
    "You have no tools and no file access.",
  ].join(" "),
};
