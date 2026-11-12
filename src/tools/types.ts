import type { ComponentType } from "react";

export type ToolType = "llm" | "local";

/**
 * Pure, serializable description of a tool. Lives in each tool's `meta.ts`
 * so it can be imported on the server (the /api/claude route) WITHOUT pulling
 * any React / client code into the server bundle.
 *
 * For `type: "llm"` tools, `model` and `systemPrompt` are REQUIRED and are
 * only ever read server-side. The client never sends them — it sends only a
 * `toolId`, and the server looks up the trusted prompt/model here.
 */
export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  /** Emoji used as the tool's icon. */
  icon: string;
  type: ToolType;
  /** LLM tools only: model alias/name passed to `claude --model`. */
  model?: string;
  /** LLM tools only: system prompt passed to `claude --system-prompt-file`. */
  systemPrompt?: string;
  /** Optional placeholder shown in the LLM input box. */
  placeholder?: string;
}

/** Props passed to every tool component by the tool panel. */
export interface ToolComponentProps {
  tool: ToolMeta;
}

/** A fully-assembled tool: its metadata plus its React UI component. */
export interface Tool extends ToolMeta {
  component: ComponentType<ToolComponentProps>;
}
