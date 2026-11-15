import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { ofeLock } from "@/lib/ofe-sync";
import { applyDraft, discardDraft, undoDraft } from "@/lib/agent/requests";
import { withMapAccess } from "@/lib/agent/request-access";

type Params = { params: Promise<{ draftId: string }> };

// POST /api/agent-requests/drafts/:draftId {action: "apply" | "discard" | "undo"}
// The person's side of a Cartographer draft. Apply only INSERTS points/polygons
// (tagged agent_draft_id); undo removes exactly those, and refuses if any of the
// points already has collected data. OFE-owned maps are read-only here.
export async function POST(req: Request, { params }: Params) {
  const draftId = Number((await params).draftId);
  const draft = Number.isInteger(draftId)
    ? await basePrisma.agentGeometryDraft.findUnique({ where: { id: draftId }, select: { sampling_map_id: true } })
    : null;
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return withMapAccess(draft.sampling_map_id, async ({ userId, map }) => {
    if (body.action === "discard") return NextResponse.json(await discardDraft(draftId));
    if (body.action !== "apply" && body.action !== "undo") {
      return NextResponse.json({ error: "action must be apply, discard or undo" }, { status: 400 });
    }
    const locked = await ofeLock({ map: map.id });
    if (locked) return locked;
    return NextResponse.json(body.action === "apply" ? await applyDraft(draftId, userId) : await undoDraft(draftId));
  });
}
