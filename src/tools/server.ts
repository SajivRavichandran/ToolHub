import type { ToolMeta } from "@/tools/types";
import { toolMetas } from "@/tools/metas";

const byId = new Map<string, ToolMeta>(toolMetas.map((t) => [t.id, t]));

export function getToolMeta(id: string): ToolMeta | undefined {
  return byId.get(id);
}

export interface LlmToolConfig {
  model: string;
  systemPrompt: string;
}

/**
 * Resolve the trusted, server-side config for an LLM tool. Returns null if the
 * id is unknown or the tool is not an LLM tool (or is missing model/prompt).
 * The client can never supply or override model/systemPrompt — they come only
 * from here.
 */
export function getLlmToolConfig(id: string): LlmToolConfig | null {
  const tool = byId.get(id);
  if (!tool || tool.type !== "llm") return null;
  if (!tool.model || !tool.systemPrompt) return null;
  return { model: tool.model, systemPrompt: tool.systemPrompt };
}
