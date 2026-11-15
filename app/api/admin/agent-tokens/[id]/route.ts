import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSleuthAdmin } from "@/lib/agent/admin";

// DELETE /api/admin/agent-tokens/:id — revoke (kept for the audit trail; its
// runs and outputs stay attributable). Takes effect on the token's next request.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSleuthAdmin(async ({ labId }) => {
    const id = Number.parseInt((await params).id, 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const now = new Date();
    const { count } = await prisma.agentToken.updateMany({
      where: { id, lab_id: labId, revoked_at: null },
      data: { revoked_at: now },
    });
    if (count === 0) return NextResponse.json({ error: "Not found or already revoked" }, { status: 404 });
    // Close its open runs so nothing more lands under them.
    await prisma.agentRun.updateMany({
      where: { token_id: id, lab_id: labId, status: "open" },
      data: { status: "aborted", ended_at: now, summary: "Token revoked" },
    });
    return NextResponse.json({ ok: true });
  });
}
