import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";
import { prisma } from "@/lib/prisma";
import { RequestInputError } from "@/lib/pipeline-requests";

type RequestRow = NonNullable<Awaited<ReturnType<typeof prisma.pipelineRequest.findFirst>>>;

/**
 * Session wrapper for /api/pipeline-requests/*: any signed-in user, in their
 * effective lab (applied explicitly as well as through RLS). With an id, the
 * request is looked up in that lab (another lab's is a plain 404).
 * RequestInputError → 400 with its text.
 */
export async function withPipelineRequest(
  idParam: string | null,
  fn: (ctx: { session: Session; labId: number; request: RequestRow | null }) => Promise<Response>,
): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  if (labId == null) return NextResponse.json({ error: "Your account has no lab" }, { status: 400 });
  return runWithLab(slug, async () => {
    let request: RequestRow | null = null;
    if (idParam != null) {
      const id = Number(idParam);
      request = Number.isInteger(id) && id > 0 ? await prisma.pipelineRequest.findFirst({ where: { id, lab_id: labId } }) : null;
      if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      return await fn({ session, labId, request });
    } catch (err) {
      if (err instanceof RequestInputError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}
