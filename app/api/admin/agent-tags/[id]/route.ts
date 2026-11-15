import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAgentAdmin } from "@/lib/agent/admin";

// DELETE /api/admin/agent-tags/:id — also removes the agent's links to it.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAdmin(async ({ labId }) => {
    const id = Number.parseInt((await params).id, 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const { count } = await prisma.agentTagVocabulary.deleteMany({ where: { id, lab_id: labId } });
    if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
