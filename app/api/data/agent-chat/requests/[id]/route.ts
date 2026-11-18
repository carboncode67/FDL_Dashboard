import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownRequest, withBearerChat } from "@/lib/agent/chat-access";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/data/agent-chat/requests/:id — cancel one of your own queued or in-progress requests.
export async function DELETE(req: Request, { params }: Params) {
  const id = Number((await params).id);
  return withBearerChat(req, async ({ person, labId }) => {
    await ownRequest(person, labId, id);
    const n = await prisma.agentRequest.updateMany({
      where: { id, status: { in: ["queued", "claimed"] } },
      data: { status: "cancelled", answer: "Cancelled." },
    });
    if (n.count !== 1) return NextResponse.json({ error: "This request has already finished" }, { status: 409 });
    return NextResponse.json({ id, status: "cancelled" });
  });
}
