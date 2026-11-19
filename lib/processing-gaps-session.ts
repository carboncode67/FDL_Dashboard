import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { canEdit, isAdmin, type Role } from "@/lib/roles";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";

/**
 * Session wrapper for the "Unprocessable data" routes (migration 102).
 * `edit` = admin/member (dismiss / re-open one flag); `admin` = lab-wide
 * "never flag this type". The lab is the user's effective lab, applied
 * explicitly in every query.
 */
export async function withGapSession(
  need: "edit" | "admin",
  fn: (ctx: { session: Session; labId: number }) => Promise<NextResponse>,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user.role ?? "viewer") as Role;
  if (need === "admin" ? !isAdmin(role) : !canEdit(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  if (labId == null) return NextResponse.json({ error: "Your account has no lab" }, { status: 400 });
  return runWithLab(slug, () => fn({ session, labId }));
}

export function noteFrom(body: unknown): string | null {
  const n = (body as { note?: unknown })?.note;
  if (typeof n !== "string") return null;
  const t = n.trim().slice(0, 500);
  return t || null;
}
