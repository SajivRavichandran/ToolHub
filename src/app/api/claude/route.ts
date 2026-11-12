import { getLlmToolConfig } from "@/tools/server";
import { spawnClaudeStream } from "@/lib/claude-cli";
import { checkRateLimit, tryAcquireSlot, releaseSlot } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT = 20_000;

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function POST(req: Request) {
  let body: { toolId?: unknown; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const { toolId, input } = body;

  if (typeof toolId !== "string" || !toolId) {
    return json({ error: "Missing or invalid 'toolId'." }, 400);
  }
  if (typeof input !== "string") {
    return json({ error: "Missing or invalid 'input'." }, 400);
  }
  if (!input.trim()) {
    return json({ error: "Input is empty." }, 400);
  }
  if (input.length > MAX_INPUT) {
    return json(
      { error: `Input exceeds the ${MAX_INPUT.toLocaleString()} character limit.` },
      413,
    );
  }

  // Trusted server-side lookup. The client never supplies model/systemPrompt.
  const config = getLlmToolConfig(toolId);
  if (!config) {
    return json({ error: `Unknown or non-LLM tool: '${toolId}'.` }, 400);
  }

  const rate = checkRateLimit();
  if (!rate.ok) {
    return json(
      { error: "Rate limit exceeded. Please wait a moment and try again." },
      429,
      { "Retry-After": String(rate.retryAfterSeconds ?? 30) },
    );
  }

  if (!tryAcquireSlot()) {
    return json(
      { error: "The assistant is busy with other requests. Try again shortly." },
      429,
      { "Retry-After": "5" },
    );
  }

  const { stream } = spawnClaudeStream({
    model: config.model,
    systemPrompt: config.systemPrompt,
    input,
    signal: req.signal,
  });

  // Release the concurrency slot once the stream finishes (or the client leaves).
  const released = { done: false };
  const release = () => {
    if (!released.done) {
      released.done = true;
      releaseSlot();
    }
  };

  const monitored = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
      flush() {
        release();
      },
    }),
  );

  // Safety net in case the stream is garbage-collected without flushing.
  req.signal.addEventListener("abort", release, { once: true });

  return new Response(monitored, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
