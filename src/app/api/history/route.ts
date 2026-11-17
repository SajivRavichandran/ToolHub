import { NextRequest, NextResponse } from "next/server";
import {
  appendEntry,
  clearTool,
  deleteEntry,
  listEntries,
} from "@/lib/history";

export const dynamic = "force-dynamic";

// GET /api/history?toolId=rewrite  -> { entries: HistoryEntry[] }
export async function GET(req: NextRequest) {
  const toolId = req.nextUrl.searchParams.get("toolId");
  if (!toolId) {
    return NextResponse.json({ error: "toolId is required" }, { status: 400 });
  }
  try {
    const entries = await listEntries(toolId);
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// POST /api/history  { toolId, input, output, meta? } -> { entry }
export async function POST(req: NextRequest) {
  let body: {
    toolId?: string;
    input?: string;
    output?: string;
    meta?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { toolId, input, output, meta } = body;
  if (!toolId || typeof input !== "string" || typeof output !== "string") {
    return NextResponse.json(
      { error: "toolId, input and output are required" },
      { status: 400 },
    );
  }

  try {
    const entry = await appendEntry({ toolId, input, output, meta });
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// DELETE /api/history?toolId=rewrite&id=abc   (one)
// DELETE /api/history?toolId=rewrite&all=1    (clear the tool)
export async function DELETE(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const toolId = params.get("toolId");
  if (!toolId) {
    return NextResponse.json({ error: "toolId is required" }, { status: 400 });
  }
  try {
    if (params.get("all")) {
      await clearTool(toolId);
    } else {
      const id = params.get("id");
      if (!id) {
        return NextResponse.json(
          { error: "id or all is required" },
          { status: 400 },
        );
      }
      await deleteEntry(toolId, id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
