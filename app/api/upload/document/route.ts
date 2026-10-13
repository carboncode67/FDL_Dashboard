import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { resolveFarmId, resolveFarmIdForLabMember } from "@/lib/proximity";
import { matchDocumentToTemplate } from "@/lib/document-template-match";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

// Cap on a single document upload. Checked against Content-Length before the
// body is parsed (formData() buffers the whole request) and again against the
// parsed file size, since Content-Length can be absent or wrong.
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
const tooLarge = () =>
  NextResponse.json({ error: "File too large (100 MB max)" }, { status: 413 });

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES) return tooLarge();
  return runWithLab(auth.labSlug, async () => {

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (file && file.size > MAX_DOCUMENT_BYTES) return tooLarge();
    const note = (formData.get("note") as string) ?? "";
    const ticket_ref = (formData.get("ticket_ref") as string) ?? "";
    const timestamp = (formData.get("timestamp") as string) ?? "";

    let filename = "";
    let fileBuffer: Buffer | null = null;
    if (file && file.size > 0) {
      const dir = path.join(DATA_DIR, "documents");
      fs.mkdirSync(dir, { recursive: true });
      filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fileBuffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(path.join(dir, filename), fileBuffer);
    }

    if (auth.kind === "labMember") {
      const farmId = await resolveFarmIdForLabMember(null, null);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          media_type: "document",
          filename: filename || null,
          content: note || null,
          date_collected: timestamp ? new Date(timestamp) : null,
          // Same convention as upload/photo: no farm resolved -> 1 (unassigned),
          // left for manual organization in the web UI.
          status: farmId != null ? 2 : 1,
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, null, null);
      const ext = filename ? path.extname(filename).toLowerCase() : "";
      const match = fileBuffer ? await matchDocumentToTemplate(fileBuffer, ext) : null;

      const doc = await prisma.document.create({
        data: {
          source: "whatsapp",
          contact_id: auth.contact.id,
          farm_id: farmId,
          filename,
          note: note || null,
          timestamp: timestamp ? new Date(timestamp) : null,
          status: 2,
          ticket_ref: ticket_ref || null,
          data_table_id: match?.dataTableId ?? null,
          test_id: match?.testId ?? null,
          drone_id: match?.droneId ?? null,
        },
      });

      const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
      matchAndTriggerPipelines({
        table: "documents",
        id: doc.id,
        category: doc.category ?? null,
        project_id: doc.project_id ?? null,
        data_table_id: doc.data_table_id ?? null,
        inputFileUrl: `${baseUrl}/api/data/files/documents/${doc.id}`,
      }).catch((err) => console.error("[upload/document POST] pipeline trigger failed", err));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/document]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
  });
}
