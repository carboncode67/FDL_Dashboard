import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAgent } from "@/lib/agent/auth";

const MAX_TOOL_LOG_BYTES = 2 * 1024 * 1024;

// POST /api/agent/runs/:id/close {status?: "closed" | "aborted", summary?, tool_log?}
// Ends a run; no writes are accepted against it afterwards. tool_log is the
// broker's record of every tool call, kept for the AI Activity review page.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgent(req, "write", async (agent) => {
    const runId = Number.parseInt((await params).id, 10);
    if (Number.isNaN(runId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const status = body.status === "aborted" ? "aborted" : "closed";
    const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 4000) || null : null;
    let toolLog: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (body.tool_log != null) {
      if (JSON.stringify(body.tool_log).length > MAX_TOOL_LOG_BYTES) {
        return NextResponse.json({ error: `tool_log is larger than ${MAX_TOOL_LOG_BYTES} bytes` }, { status: 413 });
      }
      toolLog = body.tool_log as Prisma.InputJsonValue;
    }

    const { count } = await prisma.agentRun.updateMany({
      where: { id: runId, token_id: agent.token.id, lab_id: agent.labId, status: "open" },
      data: { status, summary, tool_log: toolLog, ended_at: new Date() },
    });
    if (count === 0) return NextResponse.json({ error: "No open run with that id for this token" }, { status: 404 });
    return NextResponse.json({ run_id: runId, status });
  });
}
