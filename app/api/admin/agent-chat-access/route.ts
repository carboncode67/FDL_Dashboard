import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAgentAdmin } from "@/lib/agent/admin";
import { CHAT_KINDS, isChatKind } from "@/lib/agent/chat-access";

/**
 * Admin Panel → Agents → "Chat access": the approved list for the agent chat in
 * the phone apps (and, later, OFE Dashboard). docs/agent-chat-access.md.
 */

// GET — this lab's grants plus everyone who could be granted (lab-member users
// that aren't service accounts, and farmer contacts), with whether they have an
// app token yet (no token = can't use the phone until they scan a QR).
export async function GET() {
  return withAgentAdmin(async ({ labId }) => {
    const [grants, users, contacts] = await Promise.all([
      prisma.agentChatAccess.findMany({ where: { lab_id: labId }, orderBy: { created_at: "desc" } }),
      prisma.user.findMany({
        where: { lab_id: labId, is_service_account: false },
        select: { id: true, name: true, email: true, role: true, bearer_token: true },
        orderBy: { name: "asc" },
      }),
      prisma.contact.findMany({
        where: { lab_id: labId },
        select: { id: true, name: true, email: true, token: true, Farm: { select: { Farm_Name: true } } },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json({
      kinds: CHAT_KINDS,
      grants: grants.map((g) => ({ id: g.id, agent_kind: g.agent_kind, user_id: g.user_id, contact_id: g.contact_id, created_at: g.created_at.toISOString() })),
      people: [
        ...users.map((u) => ({
          type: "user" as const, id: u.id, name: u.name ?? u.email, detail: `Lab member · ${u.role}`, has_app_token: !!u.bearer_token,
        })),
        ...contacts.map((c) => ({
          type: "contact" as const, id: String(c.id), name: c.name, detail: `Farmer${c.Farm?.Farm_Name ? ` · ${c.Farm.Farm_Name}` : ""}`, has_app_token: !!c.token,
        })),
      ],
    });
  });
}

// POST {agent_kind, user_id} | {agent_kind, contact_id} — approve one person.
export async function POST(req: Request) {
  return withAgentAdmin(async ({ session, labId }) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = body.agent_kind ?? "cartographer";
    if (!isChatKind(kind)) return NextResponse.json({ error: "unknown or non-chat agent_kind" }, { status: 400 });
    const userId = typeof body.user_id === "string" && body.user_id ? body.user_id : null;
    const contactId = typeof body.contact_id === "number" && Number.isInteger(body.contact_id) ? body.contact_id : null;
    if ((userId == null) === (contactId == null)) {
      return NextResponse.json({ error: "give exactly one of user_id / contact_id" }, { status: 400 });
    }
    // The person must be in this admin's lab (explicit check — RLS isn't a boundary while TENANT_ENFORCEMENT=off).
    const inLab = userId
      ? await prisma.user.findFirst({ where: { id: userId, lab_id: labId, is_service_account: false }, select: { id: true } })
      : await prisma.contact.findFirst({ where: { id: contactId!, lab_id: labId }, select: { id: true } });
    if (!inLab) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing = await prisma.agentChatAccess.findFirst({
      where: { lab_id: labId, agent_kind: kind, ...(userId ? { user_id: userId } : { contact_id: contactId }) },
    });
    const g =
      existing ??
      (await prisma.agentChatAccess.create({
        data: { lab_id: labId, agent_kind: kind, user_id: userId, contact_id: contactId, granted_by_id: session.user.id },
      }));
    return NextResponse.json(
      { id: g.id, agent_kind: g.agent_kind, user_id: g.user_id, contact_id: g.contact_id, created_at: g.created_at.toISOString() },
      { status: existing ? 200 : 201 },
    );
  });
}
