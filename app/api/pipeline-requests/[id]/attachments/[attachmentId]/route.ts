import fs from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPipelineRequest } from "@/lib/pipeline-requests-route";
import { attachmentPath, canEditRequest, removeAttachment } from "@/lib/pipeline-requests";

// GET: download an attachment (anyone in the lab). Always served as an
// opaque download (octet-stream, attachment, nosniff, sandboxed CSP): these
// are user-uploaded files and must never render in the Dashboard's origin.
// DELETE: requester while "requested", or admin.
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id, attachmentId } = await params;
  return withPipelineRequest(id, async ({ request }) => {
    const a = await prisma.pipelineRequestAttachment.findFirst({ where: { id: Number(attachmentId) || 0, request_id: request!.id } });
    if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const p = attachmentPath(request!.id, a.stored_name);
    if (!fs.existsSync(p)) return NextResponse.json({ error: "File missing" }, { status: 404 });
    const ascii = a.original_name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(Readable.toWeb(fs.createReadStream(p)) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.original_name)}`,
        "Content-Length": String(a.bytes),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
      },
    });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, attachmentId } = await params;
  return withPipelineRequest(id, async ({ session, request }) => {
    if (!canEditRequest(session, request!)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const ok = await removeAttachment(request!.id, Number(attachmentId) || 0);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  });
}
