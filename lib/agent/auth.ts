import crypto from "crypto";
import { NextResponse } from "next/server";
import type { AgentToken } from "@prisma/client";
import { basePrisma } from "@/lib/prisma";
import { resolveLabSlug, runWithLab } from "@/lib/lab-db";
import { BOUND_FEATURES, isAgentKind, kindHasFeature, KIND_SPECS, WRITE_FEATURES, type AgentFeature, type AgentKind } from "@/lib/agent/kinds";
import type { AgentBinding } from "@/lib/agent/registry";

/**
 * Agent authentication (docs/agent-sandbox-plan.md §3).
 *
 * Deliberately separate from lib/upload-auth.ts: authenticateUpload() only
 * knows Contacts.token and users.bearer_token, so an agent token can never
 * authenticate to /api/data/*, /api/upload/* or anything else that already
 * exists — default-deny by construction, not by an allowlist someone has to
 * keep in sync. Conversely, only an Agent_Tokens row is accepted here.
 *
 * The token's lab is the only lab an agent request ever sees: every
 * /api/agent/* handler gets `labId` from here and filters on it explicitly
 * (lib/agent/registry.ts), never from the request.
 */

export const AGENT_TOKEN_PREFIX = "fdla_";

export type AgentScope = "read" | "write";

export interface AgentAuth {
  token: AgentToken;
  /** From the token (migration 098) — decides features, tables and write kinds. */
  kind: AgentKind;
  /** Map-bound kinds: the claimed request's map/farm for this run (null otherwise). */
  binding: AgentBinding | null;
  labId: number;
  labSlug: string | null;
}

export function hashAgentToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** A new random token. Only its hash is stored; the raw value is shown once. */
export function generateAgentToken(): { raw: string; hash: string; prefix: string } {
  const raw = AGENT_TOKEN_PREFIX + crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashAgentToken(raw), prefix: raw.slice(0, AGENT_TOKEN_PREFIX.length + 8) };
}

const LAST_USED_RESOLUTION_MS = 60_000;

export async function authenticateAgent(
  req: Request,
  scope: AgentScope,
): Promise<AgentAuth | { error: NextResponse }> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!raw.startsWith(AGENT_TOKEN_PREFIX)) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // basePrisma: the lab isn't known until the token is found (same reason as
  // authenticateUpload's lookup).
  const token = await basePrisma.agentToken.findUnique({ where: { token_hash: hashAgentToken(raw) } });
  const now = new Date();
  if (!token || token.revoked_at || (token.expires_at && token.expires_at <= now)) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!token.scopes.includes(scope)) {
    return { error: NextResponse.json({ error: `Token lacks the "${scope}" scope` }, { status: 403 }) };
  }

  if (!token.last_used_at || now.getTime() - token.last_used_at.getTime() > LAST_USED_RESOLUTION_MS) {
    await basePrisma.agentToken.update({ where: { id: token.id }, data: { last_used_at: now } });
  }

  if (!isAgentKind(token.agent_kind)) {
    return { error: NextResponse.json({ error: "Unknown agent kind on this token" }, { status: 403 }) };
  }
  return { token, kind: token.agent_kind, binding: null, labId: token.lab_id, labSlug: await resolveLabSlug(token.lab_id) };
}

/**
 * authenticateAgent + kind check + runWithLab, for every /api/agent/* handler.
 * `feature` is what the route provides; it implies the scope (runs/write need
 * "write") and must be one the token's agent kind has (lib/agent/kinds.ts).
 */
export async function withAgent(
  req: Request,
  feature: AgentFeature,
  fn: (agent: AgentAuth) => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = await authenticateAgent(req, WRITE_FEATURES.has(feature) ? "write" : "read");
  if ("error" in auth) return auth.error;
  if (!kindHasFeature(auth.kind, feature)) {
    return NextResponse.json({ error: `${KIND_SPECS[auth.kind].label} agents can't use this endpoint` }, { status: 403 });
  }
  if (KIND_SPECS[auth.kind].mapBound && BOUND_FEATURES.has(feature)) {
    auth.binding = await resolveBinding(auth, req.headers.get("x-agent-run"));
    if (!auth.binding) {
      return NextResponse.json({ error: "No claimed request for this run — claim one first" }, { status: 403 });
    }
  }
  return runWithLab(auth.labSlug, () => fn(auth));
}

/**
 * The open run named by the broker's X-Agent-Run header, if it belongs to this
 * token and has claimed a request → that request's map and farm. The broker
 * sets the header from its own state; a run that isn't this token's, isn't open,
 * or hasn't claimed anything binds to nothing.
 */
async function resolveBinding(auth: AgentAuth, header: string | null): Promise<AgentBinding | null> {
  const runId = header && /^\d+$/.test(header) ? Number(header) : null;
  if (!runId) return null;
  const run = await basePrisma.agentRun.findFirst({
    where: { id: runId, token_id: auth.token.id, lab_id: auth.labId, status: "open", scope_map_id: { not: null }, request_id: { not: null } },
    select: { id: true, scope_map_id: true, request_id: true },
  });
  if (!run?.scope_map_id || !run.request_id) return null;
  const map = await basePrisma.samplingMap.findFirst({
    where: { id: run.scope_map_id, Farm: { lab_id: auth.labId } },
    select: { farm_id: true },
  });
  if (!map) return null;
  return { runId: run.id, requestId: run.request_id, mapId: run.scope_map_id, farmId: map.farm_id };
}
