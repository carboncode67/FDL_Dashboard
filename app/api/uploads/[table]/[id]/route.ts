import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import type { Role } from "@/lib/roles";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";

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

async function deleteRow(table: Table, id: number) {
  switch (table) {
    case "photos":              return prisma.photo.delete({ where: { id } });
    case "notes":               return prisma.note.delete({ where: { id } });
    case "recordings":          return prisma.recording.delete({ where: { id } });
    case "locations":           return prisma.location.delete({ where: { id } });
    case "lab-member-uploads":  return prisma.labMemberUpload.delete({ where: { id } });
  }
}

const VALID_STAGES = ["Unread", "Read", "AI Processed", "AI Verification Needed", "Validated"];

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

  if ("category" in body)    data.category    = body.category ?? null;
  if ("description" in body) data.description = body.description ?? null;
  if ("project_id" in body)  data.project_id  = body.project_id ? Number(body.project_id) : null;
  if ("farm_id" in body)     data.farm_id     = body.farm_id ? Number(body.farm_id) : null;
  if ("stage" in body)          data.stage          = VALID_STAGES.includes(body.stage) ? body.stage : null;
  if ("merge_group_id" in body) data.merge_group_id = body.merge_group_id ?? null;
  if ("duplicate_dismissed" in body) data.duplicate_dismissed = Boolean(body.duplicate_dismissed);
  if ("status" in body) {
    const s = Number(body.status);
    if ([1, 2, 3, 4].includes(s)) data.status = s;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const result = await updateRow(table, parseInt(id), data);

  if ("category" in data || "project_id" in data) {
    const record = result as unknown as { category?: string | null; project_id?: number | null };
    const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
    matchAndTriggerPipelines({
      table,
      id: parseInt(id),
      category: record.category ?? null,
      project_id: record.project_id ?? null,
      inputFileUrl: `${baseUrl}/api/data/files/${table}/${id}`,
    }).catch((err) => console.error("[uploads PATCH] pipeline trigger failed", err));
  }

  return NextResponse.json(result);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const editMode = await getEditMode();
  const role = (session.user.role ?? "viewer") as Role;
  if (!canDelete(role, editMode)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { table, id } = await params;
  if (!isAllowed(table)) {
    return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  await deleteRow(table, parseInt(id));
  return NextResponse.json({ ok: true });
}
