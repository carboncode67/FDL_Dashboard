import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";
import { isAdmin, type Role } from "@/lib/roles";
import { canEditRequest, loadRequestFormOptions, skeletonYaml } from "@/lib/pipeline-requests";
import type { RequestInput, RequestOutput, RequestParam, SampleRef } from "@/lib/pipeline-kinds";
import { RequestDetailClient } from "./request-detail-client";

export default async function PipelineRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  const id = Number((await params).id);
  if (labId == null || !Number.isInteger(id)) notFound();

  return runWithLab(slug, async () => {
    const r = await prisma.pipelineRequest.findFirst({
      where: { id, lab_id: labId },
      include: {
        RequestedBy: { select: { name: true, email: true } },
        StatusBy: { select: { name: true, email: true } },
        Attachments: { orderBy: { created_at: "asc" } },
      },
    });
    if (!r) notFound();
    const canEdit = canEditRequest(session, r);
    const options = canEdit ? await loadRequestFormOptions(session) : null;
    return (
      <RequestDetailClient
        request={{
          id: r.id, pipeline_key: r.pipeline_key, name: r.name, description: r.description, status: r.status,
          inputs: r.inputs as RequestInput[], outputs: r.outputs as RequestOutput[],
          params: r.params as RequestParam[], sample_data: r.sample_data as SampleRef[],
          admin_note: r.admin_note, live_version: r.live_version,
          requested_by: r.RequestedBy?.name || r.RequestedBy?.email || null,
          status_by: r.StatusBy?.name || r.StatusBy?.email || null,
          status_at: r.status_at?.toISOString() ?? null,
          created_at: r.created_at.toISOString(),
          attachments: r.Attachments.map((a) => ({ id: a.id, name: a.original_name, bytes: Number(a.bytes) })),
        }}
        yaml={skeletonYaml(r)}
        canEdit={canEdit}
        isAdmin={isAdmin((session.user.role ?? "viewer") as Role)}
        options={options}
      />
    );
  });
}
