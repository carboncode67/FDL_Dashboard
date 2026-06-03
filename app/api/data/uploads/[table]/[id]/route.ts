import { NextResponse } from "next/server";
import { authenticateUpload } from "@/lib/upload-auth";
import { isUploadTable } from "@/lib/data-api";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { table, id } = await params;
  if (!isUploadTable(table)) return NextResponse.json({ error: "Unknown table" }, { status: 400 });

  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("status" in body) {
    const s = Number(body.status);
    if ([1, 2, 3, 4].includes(s)) data.status = s;
  }
  if ("category" in body)    data.category    = body.category ?? null;
  if ("description" in body) data.description = body.description ?? null;
  if ("project_id" in body)  data.project_id  = body.project_id ? Number(body.project_id) : null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  let result;
  switch (table) {
    case "photos":             result = await prisma.photo.update({ where: { id: numId }, data }); break;
    case "notes":              result = await prisma.note.update({ where: { id: numId }, data }); break;
    case "recordings":         result = await prisma.recording.update({ where: { id: numId }, data }); break;
    case "locations":          result = await prisma.location.update({ where: { id: numId }, data }); break;
    case "lab-member-uploads": result = await prisma.labMemberUpload.update({ where: { id: numId }, data }); break;
  }

  return NextResponse.json(result);
}
