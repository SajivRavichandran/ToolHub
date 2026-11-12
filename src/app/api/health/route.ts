import { getClaudeVersion } from "@/lib/claude-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const version = await getClaudeVersion();
    return Response.json({ ok: true, version });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: (e as Error).message || "Claude CLI is not available.",
      },
      { status: 503 },
    );
  }
}
