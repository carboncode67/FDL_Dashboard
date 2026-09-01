import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const SAMPLE_TYPE = "data-table-samples";
const ALLOWED_EXTS = new Set([".csv", ".tsv", ".txt"]);

// An example table (real rows, not just column labels) attached to a Data
// Table so a lab member — and the pipeline-registration LLM prompt, via
// PipelineDataContext — can see actual values, not just a schema.
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
  const dataTableId = parseInt(id);
  if (isNaN(dataTableId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const table = await prisma.dataTable.findUnique({ where: { id: dataTableId } });
  if (!table) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json({ error: `File type ${ext} not allowed — use .csv` }, { status: 400 });
  }

  // Replace any previous sample.
  if (table.sample_filename) {
    try { fs.unlinkSync(path.join(DATA_DIR, SAMPLE_TYPE, table.sample_filename)); } catch {}
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}_${sanitizedName}`;
  const dir = path.join(DATA_DIR, SAMPLE_TYPE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

  const updated = await prisma.dataTable.update({
    where: { id: dataTableId },
    data: { sample_filename: filename, sample_original_name: file.name },
  });

  return NextResponse.json({
    sample_filename: updated.sample_filename,
    sample_original_name: updated.sample_original_name,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const dataTableId = parseInt(id);
  if (isNaN(dataTableId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const table = await prisma.dataTable.findUnique({ where: { id: dataTableId } });
  if (!table) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (table.sample_filename) {
    try { fs.unlinkSync(path.join(DATA_DIR, SAMPLE_TYPE, table.sample_filename)); } catch {}
  }

  await prisma.dataTable.update({
    where: { id: dataTableId },
    data: { sample_filename: null, sample_original_name: null },
  });

  return new NextResponse(null, { status: 204 });
}
