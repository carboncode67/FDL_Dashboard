import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/roles";
import { withPipelineRequest } from "@/lib/pipeline-requests-route";
import { canEditRequest, parseSpec, parseStatus, removeRequestFiles, resolveSamples } from "@/lib/pipeline-requests";

// GET one request. PATCH:
//   { spec: {name, description, inputs, outputs, params, sample_data} }  requester while "requested", or admin
//   { status, admin_note?, live_version? }                               admin only
// DELETE: requester while "requested", or admin.
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return withPipelineRequest((await params).id, async ({ request }) => {
    const r = await prisma.pipelineRequest.findUniqueOrThrow({
      where: { id: request!.id },
      include: {
        RequestedBy: { select: { name: true, email: true } },
        StatusBy: { select: { name: true, email: true } },
        Attachments: { orderBy: { created_at: "asc" }, select: { id: true, original_name: true, bytes: true, created_at: true } },
      },
    });
    return NextResponse.json({ ...r, Attachments: r.Attachments.map((a) => ({ ...a, bytes: Number(a.bytes) })) });
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return withPipelineRequest((await params).id, async ({ session, request }) => {
    const r = request!;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const admin = isAdmin((session.user.role ?? "viewer") as Role);
    const data: Parameters<typeof prisma.pipelineRequest.update>[0]["data"] = {};

    if (body.spec && typeof body.spec === "object") {
      if (!canEditRequest(session, r)) {
        return NextResponse.json({ error: "Only the requester can edit it, and only while it is still \"requested\"" }, { status: 403 });
      }
      const spec = parseSpec(body.spec as Record<string, unknown>);
      Object.assign(data, {
        name: spec.name, description: spec.description, inputs: spec.inputs, outputs: spec.outputs, params: spec.params,
        sample_data: await resolveSamples(spec.sample_data, session),
      });
    }
    if (body.status !== undefined || body.admin_note !== undefined || body.live_version !== undefined) {
      if (!admin) return NextResponse.json({ error: "Only admins change a request's status" }, { status: 403 });
      if (body.status !== undefined) {
        data.status = parseStatus(body.status);
        data.status_at = new Date();
        data.StatusBy = session.user.id ? { connect: { id: session.user.id } } : undefined;
      }
      if (body.admin_note !== undefined) data.admin_note = typeof body.admin_note === "string" ? body.admin_note.trim().slice(0, 2000) || null : null;
      if (body.live_version !== undefined) {
        const v = Number(body.live_version);
        data.live_version = body.live_version === null || body.live_version === "" ? null : Number.isInteger(v) && v > 0 ? v : r.live_version;
      }
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    await prisma.pipelineRequest.update({ where: { id: r.id }, data });
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withPipelineRequest((await params).id, async ({ session, request }) => {
    if (!canEditRequest(session, request!)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.pipelineRequest.delete({ where: { id: request!.id } });
    await removeRequestFiles(request!.id);
    return NextResponse.json({ ok: true });
  });
}
