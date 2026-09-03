import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const ALLOWED = ["photos", "notes", "recordings", "locations", "lab-member-uploads", "documents", "videos"] as const;
type Table = (typeof ALLOWED)[number];

function isAllowed(t: string): t is Table {
  return (ALLOWED as readonly string[]).includes(t);
}

async function setMergeGroup(table: Table, id: number, mergeGroupId: string | null) {
  switch (table) {
    case "photos":             return prisma.photo.update({ where: { id }, data: { merge_group_id: mergeGroupId } });
    case "notes":              return prisma.note.update({ where: { id }, data: { merge_group_id: mergeGroupId } });
    case "recordings":         return prisma.recording.update({ where: { id }, data: { merge_group_id: mergeGroupId } });
    case "locations":          return prisma.location.update({ where: { id }, data: { merge_group_id: mergeGroupId } });
    case "lab-member-uploads": return prisma.labMemberUpload.update({ where: { id }, data: { merge_group_id: mergeGroupId } });
    case "documents":          return prisma.document.update({ where: { id }, data: { merge_group_id: mergeGroupId } });
    case "videos":             return prisma.video.update({ where: { id }, data: { merge_group_id: mergeGroupId } });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const items: { table: string; id: number }[] = body.items ?? [];
  const mergeGroupId: string = body.merge_group_id ?? crypto.randomUUID();

  if (!Array.isArray(items) || items.length < 2) {
    return NextResponse.json({ error: "At least 2 items required to merge" }, { status: 400 });
  }

  for (const item of items) {
    if (!isAllowed(item.table)) {
      return NextResponse.json({ error: `Unknown table: ${item.table}` }, { status: 400 });
    }
  }

  await Promise.all(
    items.map((item) => setMergeGroup(item.table as Table, item.id, mergeGroupId))
  );

  return NextResponse.json({ merge_group_id: mergeGroupId });
}
