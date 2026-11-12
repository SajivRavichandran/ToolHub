import type { ToolMeta } from "@/tools/types";

export const meta: ToolMeta = {
  id: "summarizer",
  name: "Text Summarizer",
  description: "Condense long text into a clear, concise summary.",
  icon: "📝",
  type: "llm",
  model: "sonnet",
  placeholder: "Paste the text you want summarized…",
  systemPrompt: [
    "You are a precise summarization assistant.",
    "Given a block of text, produce a concise, faithful summary.",
    "Start with a one-sentence TL;DR, then 3-6 bullet points of key takeaways.",
    "Do not add information that is not present in the source text.",
    "Respond in plain text/markdown only. You have no tools and no file access.",
  ].join(" "),
};
