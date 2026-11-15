import { NextResponse } from "next/server";
import { basePrisma, prisma } from "@/lib/prisma";
import { withMapAccess } from "@/lib/agent/request-access";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/agent-requests/:id — cancel a queued or in-progress request (requester or admin).
export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  const r = Number.isInteger(id)
    ? await basePrisma.agentRequest.findUnique({ where: { id }, select: { sampling_map_id: true, requested_by_id: true } })
    : null;
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return withMapAccess(r.sampling_map_id, async ({ session, userId }) => {
    if (r.requested_by_id !== userId && session.user.role !== "admin") {
      return NextResponse.json({ error: "Only the requester or an admin can cancel this" }, { status: 403 });
    }
    const n = await prisma.agentRequest.updateMany({
      where: { id, status: { in: ["queued", "claimed"] } },
      data: { status: "cancelled", answer: "Cancelled." },
    });
    if (n.count !== 1) return NextResponse.json({ error: "This request has already finished" }, { status: 409 });
    return NextResponse.json({ id, status: "cancelled" });
  });
}
