import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
  fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

  const doc = await prisma.document.create({
    data: {
      farm_id: farmId,
      filename,
      original_name: file.name,
      file_type: ext.slice(1),
      file_size: file.size,
      description: description ?? null,
    },
  });

  return NextResponse.json({ ok: true, id: doc.id });
}
