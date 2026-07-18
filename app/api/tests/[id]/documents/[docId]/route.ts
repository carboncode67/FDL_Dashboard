import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, docId } = await params;
  const testId = parseInt(id);
  const documentId = parseInt(docId);
  if (isNaN(testId) || isNaN(documentId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, test_id: testId },
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await prisma.document.delete({ where: { id: doc.id } });

  const filePath = path.join(DATA_DIR, "documents", path.basename(doc.filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return NextResponse.json({ ok: true });
}
