"use client";

import type { ComponentType } from "react";
import type { Tool, ToolComponentProps } from "@/tools/types";
import { toolMetas } from "@/tools/metas";

import { LlmRunner } from "@/components/LlmRunner";
import { CsrGenerator } from "@/tools/csr-generator/Tool";
import { JwtCreator } from "@/tools/jwt-creator/Tool";
import { JsonFormatter } from "@/tools/json-formatter/Tool";
import { WordCounter } from "@/tools/word-counter/Tool";
import { Base64Tool } from "@/tools/base64/Tool";

/**
 * Map of toolId -> React component. LLM tools share the generic `LlmRunner`;
 * local tools provide their own component. Add a local tool's component here.
 */
const componentById: Record<string, ComponentType<ToolComponentProps>> = {
  "csr-generator": CsrGenerator,
  "jwt-creator": JwtCreator,
  "json-formatter": JsonFormatter,
  "word-counter": WordCounter,
  base64: Base64Tool,
};

/** Fully-assembled tools (metadata + component), in registry order. */
export const tools: Tool[] = toolMetas.map((meta) => {
  const component =
    meta.type === "llm" ? LlmRunner : componentById[meta.id];
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
