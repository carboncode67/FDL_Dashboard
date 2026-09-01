import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { matchDocumentToTemplate } from "@/lib/document-template-match";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const ALLOWED_EXTS = new Set([".pdf", ".csv", ".docx", ".doc", ".xlsx", ".txt"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: farmIdStr } = await params;
  const farmId = parseInt(farmIdStr);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm ID" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const description = (formData.get("description") as string | null) ?? undefined;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json({ error: `File type ${ext} not allowed` }, { status: 400 });
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}_${sanitizedName}`;
  const dir = path.join(DATA_DIR, "documents");
  fs.mkdirSync(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, filename), buffer);

  const match = await matchDocumentToTemplate(buffer, ext);

  const doc = await prisma.document.create({
    data: {
      farm_id: farmId,
      filename,
      original_name: file.name,
      file_type: ext.slice(1),
      file_size: file.size,
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
  }).catch((err) => console.error("[farms documents POST] pipeline trigger failed", err));

  return NextResponse.json({ ok: true, id: doc.id, matched_data_table_id: doc.data_table_id });
}
