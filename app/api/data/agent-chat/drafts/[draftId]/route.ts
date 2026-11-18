import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { ofeLock } from "@/lib/ofe-sync";
import { applyDraft, discardDraft, undoDraft } from "@/lib/agent/requests";
import { chatMap, ownRequest, requesterOf, withBearerChat } from "@/lib/agent/chat-access";

type Params = { params: Promise<{ draftId: string }> };

// POST /api/data/agent-chat/drafts/:draftId {action: "apply" | "discard" | "undo"}
// The app user's side of a draft on one of their OWN requests, on a map that is
// still sent to them. Same semantics as the web route: apply only INSERTS
// (tagged agent_draft_id), undo removes exactly those and refuses once a point
// has collected data, OFE-owned maps are read-only.
export async function POST(req: Request, { params }: Params) {
  const draftId = Number((await params).draftId);
  return withBearerChat(req, async ({ person, labId }) => {
    const draft = Number.isInteger(draftId)
      ? await basePrisma.agentGeometryDraft.findFirst({ where: { id: draftId, lab_id: labId }, select: { request_id: true, sampling_map_id: true } })
      : null;
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ownRequest(person, labId, draft.request_id);
    const map = await chatMap(labId, person, draft.sampling_map_id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "discard") return NextResponse.json(await discardDraft(draftId));
    if (body.action !== "apply" && body.action !== "undo") {
      return NextResponse.json({ error: "action must be apply, discard or undo" }, { status: 400 });
    }
    const locked = await ofeLock({ map: map.id });
    if (locked) return locked;
    return NextResponse.json(body.action === "apply" ? await applyDraft(draftId, requesterOf(person)) : await undoDraft(draftId));
  });
}
