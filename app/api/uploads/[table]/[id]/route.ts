import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const ALLOWED = ["photos", "notes", "recordings", "locations", "lab-member-uploads"] as const;
type Table = (typeof ALLOWED)[number];

function isAllowed(t: string): t is Table {
  return (ALLOWED as readonly string[]).includes(t);
}

async function updateRow(table: Table, id: number, data: Record<string, unknown>) {
  switch (table) {
    case "photos":              return prisma.photo.update({ where: { id }, data });
    case "notes":               return prisma.note.update({ where: { id }, data });
    case "recordings":          return prisma.recording.update({ where: { id }, data });
    case "locations":           return prisma.location.update({ where: { id }, data });
    case "lab-member-uploads":  return prisma.labMemberUpload.update({ where: { id }, data });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table, id } = await params;
  if (!isAllowed(table)) {
    return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  const VALID_STAGES = ["Unread", "AI Processed", "AI Verification Needed", "Validated"];

  if ("category" in body)    data.category    = body.category ?? null;
  if ("description" in body) data.description = body.description ?? null;
  if ("project_id" in body)  data.project_id  = body.project_id ? Number(body.project_id) : null;
  if ("farm_id" in body)     data.farm_id     = body.farm_id ? Number(body.farm_id) : null;
  if ("stage" in body)       data.stage       = VALID_STAGES.includes(body.stage) ? body.stage : null;
  if ("status" in body) {
    const s = Number(body.status);
    if ([1, 2, 3, 4].includes(s)) data.status = s;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const result = await updateRow(table, parseInt(id), data);
  return NextResponse.json(result);
}
