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
    "Default to a clear, professional-but-friendly tone unless the text implies another.",
    "Return only the rewritten text, with no preamble or explanation,",
    "unless the user explicitly asks for notes.",
    "You have no tools and no file access.",
  ].join(" "),
};
