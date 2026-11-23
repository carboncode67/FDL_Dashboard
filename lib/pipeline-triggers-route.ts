import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";
import { TriggerRuleError } from "@/lib/pipeline-triggers";

/** Session wrapper for /api/pipeline-triggers/*: any signed-in user may read; `admin` for changes. */
export async function withTriggerSession(
  need: "read" | "admin",
  fn: (ctx: { session: Session; labId: number }) => Promise<Response>,
): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (need === "admin" && !isAdmin((session.user.role ?? "viewer") as Role)) {
    return NextResponse.json({ error: "Only admins change pipeline triggers" }, { status: 403 });
  }
  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  if (labId == null) return NextResponse.json({ error: "Your account has no lab" }, { status: 400 });
  return runWithLab(slug, async () => {
    try {
      return await fn({ session, labId });
    } catch (err) {
      if (err instanceof TriggerRuleError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}
