// Server-side run history / audit log.
//
// Personal, single-machine use: history is stored as one JSON file per tool
// under <project>/data/history/<toolId>.json. Writes are serialized through an
// in-process promise chain so concurrent saves don't clobber each other. This
// file is server-only (imported from the /api/history route handler).

import { promises as fs } from "node:fs";
import path from "node:path";

export interface HistoryEntry {
  id: string;
  toolId: string;
  ts: number; // epoch ms
  input: string;
  output: string;
  meta?: Record<string, unknown>;
}

const DATA_DIR = path.join(process.cwd(), "data", "history");
const MAX_ENTRIES_PER_TOOL = 200;
const MAX_FIELD_CHARS = 100_000;

/** Only allow safe tool ids as filenames (no path traversal). */
function safeToolId(toolId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(toolId)) {
    throw new Error("Invalid toolId");
  }
  return toolId;
}

function fileFor(toolId: string): string {
  return path.join(DATA_DIR, `${safeToolId(toolId)}.json`);
}

async function readFileEntries(toolId: string): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(fileFor(toolId), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

// Serialize all mutations per process to avoid read-modify-write races.
let writeChain: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  // Keep the chain alive but swallow errors so one failure doesn't poison it.
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function clamp(s: unknown): string {
  const str = typeof s === "string" ? s : String(s ?? "");
  return str.length > MAX_FIELD_CHARS ? str.slice(0, MAX_FIELD_CHARS) : str;
}

export async function listEntries(toolId: string): Promise<HistoryEntry[]> {
  const entries = await readFileEntries(toolId);
  // Newest first.
  return entries.sort((a, b) => b.ts - a.ts);
}

export async function appendEntry(input: {
  toolId: string;
  input: string;
  output: string;
  meta?: Record<string, unknown>;
}): Promise<HistoryEntry> {
  const toolId = safeToolId(input.toolId);
  const entry: HistoryEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    toolId,
    ts: Date.now(),
    input: clamp(input.input),
    output: clamp(input.output),
    meta: input.meta,
  };

  await withWriteLock(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const entries = await readFileEntries(toolId);
    entries.unshift(entry);
    const trimmed = entries.slice(0, MAX_ENTRIES_PER_TOOL);
    await fs.writeFile(fileFor(toolId), JSON.stringify(trimmed, null, 2), "utf8");
  });

  return entry;
}

export async function deleteEntry(toolId: string, id: string): Promise<void> {
  const tid = safeToolId(toolId);
  await withWriteLock(async () => {
    const entries = await readFileEntries(tid);
    const next = entries.filter((e) => e.id !== id);
    if (next.length !== entries.length) {
      await fs.writeFile(fileFor(tid), JSON.stringify(next, null, 2), "utf8");
    }
  });
}

export async function clearTool(toolId: string): Promise<void> {
  const tid = safeToolId(toolId);
  await withWriteLock(async () => {
    await fs.rm(fileFor(tid), { force: true });
  });
}
