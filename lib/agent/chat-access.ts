import { NextResponse } from "next/server";
import { basePrisma, prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { AGENT_KINDS, KIND_SPECS, type AgentKind } from "@/lib/agent/kinds";
import { assignmentWhereForContact, assignmentWhereForLabMember } from "@/lib/sampling-maps";
import { RequestError } from "@/lib/agent/requests";

/**
 * Who may chat with an interactive agent outside the web dashboard
 * (migration 101, docs/agent-chat-access.md).
 *
 * The approved list is Agent_Chat_Access: one row per person (a lab-member User
 * OR a farmer Contact) per agent kind, managed from Admin Panel → Agents. It is
 * identity-based, not channel-based: the phone apps reach it through their QR
 * bearer token (withBearerChat below); OFE Dashboard will reach the same rows
 * later by resolving its signed-in farmer's email to a ChatPerson (User first,
 * else Contact — same order as /api/data/ofe/app-qr) behind its service token.
 * Everything below takes a ChatPerson, so that route only needs a new resolver.
 *
 * The web dashboard's floating chat is unaffected (session + canEdit).
 */

export type ChatPerson =
  | { kind: "user"; userId: string }
  | { kind: "contact"; contactId: number; farmsId: number | null; assignedExperimentId: number | null };

/** Agent kinds that have a chat (interactive, request/answer). Data Sleuth has none. */
export const CHAT_KINDS: readonly AgentKind[] = AGENT_KINDS.filter((k) => KIND_SPECS[k].mapBound);

export function isChatKind(v: unknown): v is AgentKind {
  return typeof v === "string" && (CHAT_KINDS as readonly string[]).includes(v);
}

const BLURBS: Partial<Record<AgentKind, string>> = {
  cartographer: "Draws sampling points and shapes on the map you're looking at. Nothing changes until you tap Apply.",
};

export function chatAgentInfo(kind: AgentKind) {
  return { kind, label: KIND_SPECS[kind].label, blurb: BLURBS[kind] ?? KIND_SPECS[kind].description, needs_map: KIND_SPECS[kind].mapBound };
}

function personWhere(p: ChatPerson) {
  return p.kind === "user" ? { user_id: p.userId } : { contact_id: p.contactId };
}

/** The chat kinds this person is approved for in this lab. */
export async function grantedChatKinds(labId: number, person: ChatPerson): Promise<AgentKind[]> {
  const rows = await prisma.agentChatAccess.findMany({
    where: { lab_id: labId, agent_kind: { in: [...CHAT_KINDS] }, ...personWhere(person) },
    select: { agent_kind: true },
  });
  return rows.map((r) => r.agent_kind as AgentKind);
}

/** Requester / applier columns for this person on Agent_Requests / drafts. */
export function requesterOf(person: ChatPerson): { userId: string | null; contactId: number | null } {
  return person.kind === "user" ? { userId: person.userId, contactId: null } : { userId: null, contactId: person.contactId };
}

export function ownRequestWhere(person: ChatPerson) {
  return person.kind === "user" ? { requested_by_id: person.userId } : { requested_by_contact_id: person.contactId };
}

/** Sampling-map assignment filter that makes a map visible to this person on the phone. */
function assignmentWhere(person: ChatPerson) {
  return person.kind === "user"
    ? assignmentWhereForLabMember(person.userId)
    : assignmentWhereForContact({ id: person.contactId, farms_id: person.farmsId, assigned_experiment_id: person.assignedExperimentId });
}

/**
 * Maps this person can attach to a chat request: sent to them (same visibility
 * rule as the phone's map list), on a farm in their lab, and not OFE-owned
 * (read-only in FDB, so a draft could never be applied).
 */
export async function chatMapIds(labId: number, person: ChatPerson): Promise<number[]> {
  const maps = await prisma.samplingMap.findMany({
    where: { ofe_id: null, Farm: { lab_id: labId }, Assignments: assignmentWhere(person) },
    select: { id: true },
  });
  return maps.map((m) => m.id);
}

/** One map, same rule as chatMapIds. Same 404 for "doesn't exist" and "not yours". */
export async function chatMap(labId: number, person: ChatPerson, mapId: unknown) {
  if (typeof mapId !== "number" || !Number.isInteger(mapId)) throw new RequestError("Not found", 404);
  const map = await prisma.samplingMap.findFirst({
    where: { id: mapId, Farm: { lab_id: labId }, Assignments: assignmentWhere(person) },
    select: { id: true, farm_id: true, ofe_id: true },
  });
  if (!map) throw new RequestError("Not found", 404);
  if (map.ofe_id != null) throw new RequestError("This map is managed in OFE Dashboard, so the agent can't change it here.", 409);
  return map;
}

/** The lean request shape both apps render (no provenance). */
export function toChatRequest(r: {
  id: number; agent_kind: string; sampling_map_id: number; prompt: string; status: string; answer: string | null;
  created_at: Date; context: unknown;
  Drafts: { id: number; status: string; explanation: string | null; features: unknown; grids: unknown; created_at: Date }[];
}) {
  return {
    id: r.id,
    agent_kind: r.agent_kind,
    sampling_map_id: r.sampling_map_id,
    prompt: r.prompt,
    status: r.status,
    answer: r.answer,
    created_at: r.created_at.toISOString(),
    context: r.context,
    drafts: r.Drafts.map((d) => ({
      id: d.id,
      status: d.status,
      explanation: d.explanation,
      features: d.features,
      grids: d.grids,
      created_at: d.created_at.toISOString(),
    })),
  };
}

export interface BearerChatContext {
  person: ChatPerson;
  labId: number;
  kinds: AgentKind[];
}

/**
 * Bearer-token wrapper for /api/data/agent-chat/*. A QR (restricted) token of a
 * User or Contact only — a service account has no person behind it, so it is
 * refused (OFE will get its own on-behalf-of route). `requireGrant` (default
 * true) 403s someone not on the approved list; the access-probe route passes
 * false so it can answer `enabled: false` instead.
 */
export async function withBearerChat(
  req: Request,
  fn: (ctx: BearerChatContext) => Promise<NextResponse>,
  { requireGrant = true } = {},
): Promise<NextResponse> {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  if (auth.kind === "labMember" && !auth.restricted) {
    return NextResponse.json({ error: "Service tokens can't use the agent chat" }, { status: 403 });
  }
  return runWithLab(auth.labSlug, async () => {
    const person: ChatPerson =
      auth.kind === "contact"
        ? { kind: "contact", contactId: auth.contact.id, farmsId: auth.contact.farms_id, assignedExperimentId: auth.contact.assigned_experiment_id }
        : { kind: "user", userId: auth.labMember.id };
    const labId = auth.kind === "contact" ? auth.contact.lab_id : auth.labMember.lab_id;
    const kinds = labId == null ? [] : await grantedChatKinds(labId, person);
    if (labId == null || (requireGrant && !kinds.length)) {
      if (!requireGrant) return fn({ person, labId: labId ?? -1, kinds });
      return NextResponse.json({ error: "The agent chat isn't enabled for you" }, { status: 403 });
    }
    try {
      return await fn({ person, labId, kinds });
    } catch (e) {
      if (e instanceof RequestError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}

/** Resolve a request id to its row if it is this person's own, else 404. */
export async function ownRequest(person: ChatPerson, labId: number, id: unknown) {
  if (typeof id !== "number" || !Number.isInteger(id)) throw new RequestError("Not found", 404);
  const r = await basePrisma.agentRequest.findFirst({ where: { id, lab_id: labId, ...ownRequestWhere(person) } });
  if (!r) throw new RequestError("Not found", 404);
  return r;
}
