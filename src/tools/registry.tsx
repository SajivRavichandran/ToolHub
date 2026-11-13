"use client";

import type { ComponentType } from "react";
import type { Tool, ToolComponentProps } from "@/tools/types";
import { toolMetas } from "@/tools/metas";

import { LlmRunner } from "@/components/LlmRunner";
import { RewriteRunner } from "@/tools/rewrite/Tool";
import { CsrGenerator } from "@/tools/csr-generator/Tool";
import { JwtCreator } from "@/tools/jwt-creator/Tool";
import { JsonFormatter } from "@/tools/json-formatter/Tool";
import { WordCounter } from "@/tools/word-counter/Tool";
import { Base64Tool } from "@/tools/base64/Tool";

/**
 * Map of toolId -> React component. Local tools provide their own component.
 * LLM tools default to the generic `LlmRunner`, but may override it here (e.g.
 * Rewrite adds style controls). An entry here always wins.
 */
const componentById: Record<string, ComponentType<ToolComponentProps>> = {
  rewrite: RewriteRunner,
  "csr-generator": CsrGenerator,
  "jwt-creator": JwtCreator,
  "json-formatter": JsonFormatter,
  "word-counter": WordCounter,
  base64: Base64Tool,
};

/** Fully-assembled tools (metadata + component), in registry order. */
export const tools: Tool[] = toolMetas.map((meta) => {
  const component =
    componentById[meta.id] ?? (meta.type === "llm" ? LlmRunner : undefined);
  if (!component) {
    throw new Error(
      `No component registered for local tool "${meta.id}". Add it to componentById in registry.tsx.`,
    );
  }
  return { ...meta, component };
});

export function getTool(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}
