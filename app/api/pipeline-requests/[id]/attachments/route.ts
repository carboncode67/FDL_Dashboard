import { NextResponse } from "next/server";
import { withPipelineRequest } from "@/lib/pipeline-requests-route";
import { addAttachment, canEditRequest } from "@/lib/pipeline-requests";
import { ATTACHMENT_MAX_BYTES } from "@/lib/pipeline-kinds";

// POST multipart `file` (one or more): reference material for the developer —
// a script, an example output, a spreadsheet. Stored and served back as a
// download only; never executed.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPipelineRequest((await params).id, async ({ session, request }) => {
    if (!canEditRequest(session, request!)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (Number(req.headers.get("content-length") ?? 0) > 4 * ATTACHMENT_MAX_BYTES) {
      return NextResponse.json({ error: "Too large" }, { status: 413 });
    }
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "No file" }, { status: 400 });
    const added = [];
    for (const f of files) {
      const a = await addAttachment(request!, f, session.user.id ?? null);
      added.push({ id: a.id, original_name: a.original_name, bytes: Number(a.bytes) });
    }
    return NextResponse.json({ added }, { status: 201 });
  });
}
