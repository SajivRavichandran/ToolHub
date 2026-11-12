# ToolHub

A personal, plugin-style utility platform built with **Next.js (App Router)**,
**TypeScript**, and **Tailwind CSS**. Some tools are powered by Claude via your
**locally installed Claude Code CLI** (no Anthropic API key, no SDK); others run
entirely in your browser.

## Requirements

- Node.js 18+
- [Claude Code](https://claude.com/claude-code) installed and signed in
  (`claude --version` should work, and you should be logged in).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## How it works

- **Tool registry** — every tool lives in `src/tools/<id>/`. Its pure metadata
  (`meta.ts`) is registered in `src/tools/metas.ts`; the UI component is wired
  in `src/tools/registry.tsx`. Adding a tool means a new folder plus a line or
  two there.
- **AI tools (`type: "llm"`)** call `POST /api/claude` with only
  `{ toolId, input }`. The server looks up the trusted `model` and
  `systemPrompt` from the registry (`src/tools/server.ts`) — the client can
  never set or override them — and invokes the CLI with
  `child_process.spawn` (argument array, never a shell string).
- The CLI runs headless and streaming:
  `claude -p --model <m> --system-prompt-file <f> --tools "" --output-format stream-json --verbose --include-partial-messages --permission-prompts none --no-session-persistence --strict-mcp-config`,
  in an empty temp working directory, with all built-in tools disabled. Text
  deltas are streamed back to the browser; it falls back to the final text if
  streaming yields nothing.
- **Local tools (`type: "local"`)** are pure client-side React — no network.

## Safety nets

- Max input: 20,000 characters (enforced client- and server-side).
- 60-second timeout — the child process is killed.
- At most 2 concurrent CLI processes.
- Simple in-memory rate limit (20 requests/minute).
- Clean JSON error responses; a `GET /api/health` check drives an in-app error
  banner with fix instructions when the CLI is unavailable.

## Adding a tool

1. Create `src/tools/<id>/meta.ts` exporting a `ToolMeta`
   (`type: "llm"` needs `model` + `systemPrompt`).
2. For a local tool, add `src/tools/<id>/Tool.tsx` and map it in
   `src/tools/registry.tsx`. LLM tools reuse the shared `LlmRunner`.
3. Add the meta to the list in `src/tools/metas.ts`.
