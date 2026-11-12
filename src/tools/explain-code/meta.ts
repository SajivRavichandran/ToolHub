import type { ToolMeta } from "@/tools/types";

export const meta: ToolMeta = {
  id: "explain-code",
  name: "Code Explainer",
  description: "Explain what a snippet of code does, step by step.",
  icon: "🧩",
  type: "llm",
  model: "sonnet",
  placeholder: "Paste a function or code snippet…",
  systemPrompt: [
    "You are an expert programming tutor.",
    "Given a code snippet, explain what it does in clear, accessible language.",
    "Cover: (1) a one-line summary of purpose, (2) a step-by-step walkthrough,",
    "(3) notable edge cases, bugs, or performance concerns if any.",
    "Infer the language from the code. Be accurate and concise.",
    "Respond in plain markdown. You have no tools and no file access.",
  ].join(" "),
};
