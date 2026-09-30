import { NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { matchDocumentToTemplate } from "@/lib/document-template-match";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";
import { receiveDocumentUpload } from "@/lib/document-upload";
import { runWithTenant } from "@/lib/lab-db";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectIdStr } = await params;
  const projectId = parseInt(projectIdStr);
  if (isNaN(projectId)) return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });

  const dir = path.join(DATA_DIR, "documents");
  const received = await receiveDocumentUpload(req, dir);
  if ("error" in received) return NextResponse.json({ error: received.error }, { status: received.status });
  const { filename, originalName, buffer, size, fields } = received;
  const description = fields.description?.trim() || undefined;

  const ext = path.extname(originalName).toLowerCase();
  const match = await matchDocumentToTemplate(buffer, ext);

  const doc = await prisma.document.create({
    data: {
      project_id: projectId,
      filename,
      original_name: originalName,
      file_type: ext ? ext.slice(1) : "",
      file_size: size,
      description: description ?? null,
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
  }).catch((err) => console.error("[projects documents POST] pipeline trigger failed", err));

  return NextResponse.json({ ok: true, id: doc.id, matched_data_table_id: doc.data_table_id });
  });
}
