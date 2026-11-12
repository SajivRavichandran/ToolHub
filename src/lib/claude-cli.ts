import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Locates the Claude Code CLI executable. We prefer the native `claude.exe`
 * binary (spawnable directly with shell:false — no shell, no injection, no
 * Windows .cmd restrictions). Resolution order:
 *   1. CLAUDE_CLI_PATH env override
 *   2. the native bin/claude.exe shipped next to the `claude` shim on PATH
 *   3. the raw path found via where/which
 * The result is cached for the lifetime of the server process.
 */
let cachedExe: string | null = null;

function resolveClaudeExecutable(): string {
  if (cachedExe) return cachedExe;

  const override = process.env.CLAUDE_CLI_PATH;
  if (override && fs.existsSync(override)) {
    cachedExe = override;
    return override;
  }

  const isWin = process.platform === "win32";
  const finder = isWin ? "where" : "which";

  let found: string[] = [];
  try {
    const out = execFileSync(finder, ["claude"], { encoding: "utf8" });
    found = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    found = [];
  }

  if (isWin) {
    // The shim lives beside node_modules/@anthropic-ai/claude-code/bin/claude.exe
    for (const p of found) {
      const dir = path.dirname(p);
      const candidate = path.join(
        dir,
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        "claude.exe",
      );
      if (fs.existsSync(candidate)) {
        cachedExe = candidate;
        return candidate;
      }
    }
    // Fall back to any .exe we found directly.
    const exe = found.find((p) => p.toLowerCase().endsWith(".exe"));
    if (exe) {
      cachedExe = exe;
      return exe;
    }
  }

  if (found[0]) {
    cachedExe = found[0];
    return found[0];
  }

  // Last resort: bare name and let spawn search PATH.
  cachedExe = "claude";
  return "claude";
}

/** A reusable, empty working directory so no project files / CLAUDE.md leak in. */
let cachedCwd: string | null = null;
function emptyWorkingDir(): string {
  if (cachedCwd && fs.existsSync(cachedCwd)) return cachedCwd;
  const dir = path.join(os.tmpdir(), "toolhub-cli-cwd");
  fs.mkdirSync(dir, { recursive: true });
  cachedCwd = dir;
  return dir;
}

export interface SpawnOptions {
  model: string;
  systemPrompt: string;
  input: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SpawnResult {
  /** Newline-delimited JSON events: {type:"delta",text} | {type:"error",message} | {type:"done"} */
  stream: ReadableStream<Uint8Array>;
}

const encoder = new TextEncoder();

/** Run `claude --version` with a short timeout; used by the health check. */
export function getClaudeVersion(timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let exe: string;
    try {
      exe = resolveClaudeExecutable();
    } catch (e) {
      reject(e);
      return;
    }
    const child = spawn(exe, ["--version"], { shell: false });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("`claude --version` timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `exited with code ${code}`));
    });
  });
}

/**
 * Spawn the Claude CLI in headless streaming mode and return a stream of
 * normalized NDJSON events. All tool access is disabled and the process runs
 * in an empty temp directory. The system prompt is written to a temp file and
 * passed via --system-prompt-file so no untrusted text ever reaches argv or a
 * shell. User input is delivered on stdin.
 */
export function spawnClaudeStream(opts: SpawnOptions): SpawnResult {
  const { model, systemPrompt, input, signal, timeoutMs = 60_000 } = opts;

  const exe = resolveClaudeExecutable();
  const cwd = emptyWorkingDir();
  const promptFile = path.join(os.tmpdir(), `toolhub-sp-${randomUUID()}.txt`);
  fs.writeFileSync(promptFile, systemPrompt, "utf8");

  const args = [
    "-p",
    "--model",
    model,
    "--system-prompt-file",
    promptFile,
    "--tools",
    "", // disable ALL built-in tools
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-prompts",
    "none", // auto-deny anything that would prompt
    "--no-session-persistence",
    "--strict-mcp-config", // ignore configured MCP servers
  ];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false; // controller closed — stop enqueueing
      let finished = false; // finish() already ran — make it idempotent
      let streamedText = false;
      let fullText = "";
      let errorText: string | null = null;
      let stdoutBuffer = "";
      let stderrBuffer = "";

      const child = spawn(exe, args, {
        cwd,
        shell: false,
        env: process.env, // inherit logged-in session; do NOT force an API key
        stdio: ["pipe", "pipe", "pipe"],
      });

      const cleanupFile = () => {
        fs.rm(promptFile, { force: true }, () => {});
      };

      const emit = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      const finish = (err?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        cleanupFile();
        // Emit the final events BEFORE marking the controller closed.
        if (err) {
          emit({ type: "error", message: err });
        } else if (errorText) {
          emit({ type: "error", message: errorText });
        } else if (!streamedText && fullText) {
          emit({ type: "delta", text: fullText });
        }
        emit({ type: "done" });
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        if (!child.killed) child.kill();
      };

      const timer = setTimeout(() => {
        finish("The request timed out after 60s and was cancelled.");
      }, timeoutMs);

      const onAbort = () => finish();
      if (signal) {
        if (signal.aborted) {
          finish();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const handleEvent = (obj: Record<string, unknown>) => {
        const type = obj.type;
        if (type === "stream_event") {
          const event = obj.event as Record<string, any> | undefined;
          if (
            event?.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            typeof event.delta.text === "string"
          ) {
            streamedText = true;
            emit({ type: "delta", text: event.delta.text });
          }
        } else if (type === "assistant") {
          const message = obj.message as Record<string, any> | undefined;
          const content = message?.content;
          if (Array.isArray(content)) {
            const text = content
              .filter((c: any) => c?.type === "text" && typeof c.text === "string")
              .map((c: any) => c.text)
              .join("");
            if (text) fullText = text;
          }
          if (obj.is_api_error_message && typeof message?.content?.[0]?.text === "string") {
            errorText = message.content[0].text;
          }
        } else if (type === "result") {
          if (obj.is_error) {
            const msg =
              (typeof obj.result === "string" && obj.result) ||
              errorText ||
              "The assistant returned an error.";
            errorText = msg;
          }
          finish();
        }
      };

      const processStdout = (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            handleEvent(JSON.parse(trimmed));
          } catch {
            /* ignore non-JSON noise */
          }
        }
      };

      child.stdout.on("data", (d) => processStdout(d.toString()));
      child.stderr.on("data", (d) => (stderrBuffer += d.toString()));

      child.on("error", (e) => {
        const msg =
          (e as NodeJS.ErrnoException).code === "ENOENT"
            ? "Claude CLI could not be launched. Is it installed and on your PATH?"
            : `Failed to launch Claude CLI: ${e.message}`;
        finish(msg);
      });

      child.on("close", (code) => {
        // Flush any trailing buffered line.
        if (stdoutBuffer.trim()) processStdout("\n");
        if (code !== 0 && !errorText && !streamedText && !fullText) {
          finish(
            stderrBuffer.trim() ||
              `Claude CLI exited with code ${code}.`,
          );
        } else {
          finish();
        }
      });

      // Deliver the user's input on stdin, then close it.
      child.stdin.write(input);
      child.stdin.end();
    },
  });

  return { stream };
}
