import type { ToolMeta } from "@/tools/types";

import { meta as summarizer } from "@/tools/summarizer/meta";
import { meta as explainCode } from "@/tools/explain-code/meta";
import { meta as csrGenerator } from "@/tools/csr-generator/meta";
import { meta as rewrite } from "@/tools/rewrite/meta";
import { meta as jsonFormatter } from "@/tools/json-formatter/meta";
import { meta as wordCounter } from "@/tools/word-counter/meta";
import { meta as base64 } from "@/tools/base64/meta";

/**
 * The single ordered list of tools. This is the ONLY place a new tool's
 * metadata is registered. Pure data — safe to import on the server.
 *
 * To add a tool: create `src/tools/<id>/meta.ts`, add one line here, and
 * (for a local tool) one line in `registry.tsx` mapping its component.
 */
export const toolMetas: ToolMeta[] = [
  summarizer,
  explainCode,
  csrGenerator,
  rewrite,
  jsonFormatter,
  wordCounter,
  base64,
];
