import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPipelineRequest } from "@/lib/pipeline-requests-route";
import { createRequest, parseSpec, resolveSamples } from "@/lib/pipeline-requests";

// Pipeline requests (migration 105, docs/pipeline-requests-plan.md).
// GET: every request in the user's lab. POST: a new request (any signed-in
// user): { name, description, inputs, outputs, params, sample_data }.
export const runtime = "nodejs";

export async function GET() {
  return withPipelineRequest(null, async ({ labId }) => {
    const rows = await prisma.pipelineRequest.findMany({
      where: { lab_id: labId },
      orderBy: { created_at: "desc" },
      include: { RequestedBy: { select: { name: true, email: true } }, _count: { select: { Attachments: true } } },
    });
    return NextResponse.json(rows.map((r) => ({
      id: r.id, pipeline_key: r.pipeline_key, name: r.name, status: r.status,
      requested_by: r.RequestedBy?.name || r.RequestedBy?.email || null,
      created_at: r.created_at, updated_at: r.updated_at, attachments: r._count.Attachments,
    })));
  });
}

export async function POST(req: Request) {
  return withPipelineRequest(null, async ({ session, labId }) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const spec = parseSpec(body);
    spec.sample_data = await resolveSamples(spec.sample_data, session);
    const row = await createRequest(spec, labId, session.user.id ?? null);
    return NextResponse.json({ id: row.id, pipeline_key: row.pipeline_key }, { status: 201 });
  });
}
