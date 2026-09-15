import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { resolveLabSlug } from "@/lib/lab-db";
import { isRouteAllowedForRestricted } from "@/lib/route-scopes";
import type { Contact, User } from "@prisma/client";

export type AuthResult =
  | { kind: "contact"; contact: Contact; labSlug: string | null; restricted: true }
  | { kind: "labMember"; labMember: User; labSlug: string | null; restricted: boolean }
  | { error: NextResponse };

export type BearerScopeEnforcement = "off" | "log" | "enforce";

// Defaults to "log" rather than "off": a restricted (mobile/QR-code) token is
// meant to be confined to RESTRICTED_ALLOWED_ROUTES, but until this shipped,
// nothing enforced that anywhere. "log" is non-breaking (every request still
// succeeds) and starts surfacing real violations immediately instead of
// silently doing nothing until someone remembers to set the env var — set
// BEARER_SCOPE_ENFORCEMENT=off explicitly to opt back out, or =enforce once
// the logs look clean.
export function bearerScopeEnforcement(): BearerScopeEnforcement {
  const v = process.env.BEARER_SCOPE_ENFORCEMENT;
  return v === "off" || v === "enforce" ? v : "log";
}

// The token lookup itself deliberately uses `basePrisma`, never the ambient
// `prisma` import — until we've found the token's record we don't yet know
// which lab's connection to use (see docs/lab-data-silo-plan.md §5, "Bearer-
// token / external auth"). Callers should wrap the rest of the request in
// runWithLab(auth.labSlug, ...) from lib/lab-db.ts, after this returns.
//
// Also the single choke point for the mobile-app / QR-code token scope
// restriction (see lib/route-scopes.ts) — every bearer-token route already
// calls this, so the allowlist check lives here once instead of being
// duplicated per route. A Contact token is always `restricted: true` (100%
// mobile/WhatsApp farmer use, never a service integration); a labMember
// token is restricted unless its user row has is_service_account = true
// (migration 068).
export async function authenticateUpload(request: Request): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const contact = await basePrisma.contact.findFirst({ where: { token } });
  if (contact) {
    const scopeError = checkScope(request, true, `contact:${contact.id}`);
    if (scopeError) return { error: scopeError };
    return { kind: "contact", contact, labSlug: await resolveLabSlug(contact.lab_id), restricted: true };
  }

  const labMember = await basePrisma.user.findFirst({ where: { bearer_token: token } });
  if (labMember) {
    const restricted = !labMember.is_service_account;
    const scopeError = checkScope(request, restricted, `labMember:${labMember.id}`);
    if (scopeError) return { error: scopeError };
    return { kind: "labMember", labMember, labSlug: await resolveLabSlug(labMember.lab_id), restricted };
  }

  return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

function checkScope(request: Request, restricted: boolean, who: string): NextResponse | null {
  if (!restricted) return null;
  const mode = bearerScopeEnforcement();
  if (mode === "off") return null;

  const { pathname } = new URL(request.url);
  if (isRouteAllowedForRestricted(request.method, pathname)) return null;

  const message =
    `[BEARER_SCOPE_ENFORCEMENT=${mode}] restricted identity ${who} called ` +
    `${request.method} ${pathname}, which isn't on the mobile-app allowlist ` +
    `(lib/route-scopes.ts). If this is a real integration, mark its user row ` +
    `is_service_account = true; if it's a mobile app calling something new, add it ` +
    `to RESTRICTED_ALLOWED_ROUTES.`;

  if (mode === "log") {
    console.warn(message);
    return null;
  }

  console.warn(message);
  return NextResponse.json({ error: "Forbidden — token not permitted for this endpoint" }, { status: 403 });
}
