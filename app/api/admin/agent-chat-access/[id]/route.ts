import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAgentAdmin } from "@/lib/agent/admin";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/admin/agent-chat-access/:id — revoke. The app hides the chat icon on
// its next access check; any further request from that device 403s immediately.
export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  return withAgentAdmin(async ({ labId }) => {
    const n = Number.isInteger(id) ? await prisma.agentChatAccess.deleteMany({ where: { id, lab_id: labId } }) : { count: 0 };
    if (n.count !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ id, revoked: true });
  });
}
