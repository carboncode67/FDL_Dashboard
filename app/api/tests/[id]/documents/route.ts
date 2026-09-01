import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { matchDocumentToTemplate } from "@/lib/document-template-match";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const ALLOWED_EXTS = new Set([".pdf", ".csv", ".docx", ".doc", ".xlsx", ".xls", ".txt"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const testId = parseInt(id);
  if (isNaN(testId)) return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });

  const docs = await prisma.document.findMany({
    where: { test_id: testId },
    orderBy: { uploaded_at: "desc" },
  });
  return NextResponse.json(docs);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const testId = parseInt(id);
  if (isNaN(testId)) return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });

  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });

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

  // test_id comes from the page the lab member is already on — a template
  // match only fills in data_table_id (for pipeline scoping); it never
  // overrides the explicit test_id, even if the match happens to resolve to
  // a different test's table.
  const match = await matchDocumentToTemplate(buffer, ext);

  const doc = await prisma.document.create({
    data: {
      test_id: testId,
      filename,
      original_name: file.name,
      file_type: ext.slice(1),
      file_size: file.size,
      category: "test_form",
      description: description ?? null,
      data_table_id: match?.dataTableId ?? null,
    },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  matchAndTriggerPipelines({
    table: "documents",
    id: doc.id,
    category: doc.category ?? null,
    project_id: null,
    data_table_id: doc.data_table_id ?? null,
    inputFileUrl: `${baseUrl}/api/data/files/documents/${doc.id}`,
  }).catch((err) => console.error("[tests documents POST] pipeline trigger failed", err));

  return NextResponse.json({ ok: true, id: doc.id, matched_data_table_id: doc.data_table_id });
}
