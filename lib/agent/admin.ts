import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";

/**
 * Session-authed admin routes that manage agents (tokens, tag
 * vocabulary). Admin only. The lab is the admin's effective lab, written
 * explicitly on every row — never the GUC default.
 */
export async function withAgentAdmin(
  fn: (ctx: { session: Session; labId: number }) => Promise<NextResponse>,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  if (labId == null) return NextResponse.json({ error: "Your account has no lab" }, { status: 400 });

  return runWithLab(slug, () => fn({ session, labId }));
}

/** The lab an admin's agent settings apply to: their effective lab
 *  (platform admins' "viewing as" lab), else their own user row's lab. */
export async function agentLabId(session: Session, slug: string | null): Promise<number | null> {
  if (slug) return (await basePrisma.lab.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
  return (await basePrisma.user.findUnique({ where: { id: session.user.id }, select: { lab_id: true } }))?.lab_id ?? null;
}
