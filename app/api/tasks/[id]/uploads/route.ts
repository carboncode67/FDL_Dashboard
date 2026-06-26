import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";

interface UploadRef { upload_id: number; upload_table: string; }

// POST { links: UploadRef[] } — bulk-add upload links
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const taskId = parseInt(id);
  const { links } = await req.json() as { links: UploadRef[] };

  await prisma.taskUploadLink.createMany({
    data: links.map(({ upload_id, upload_table }) => ({ task_id: taskId, upload_id, upload_table })),
    skipDuplicates: true,
  });

  const count = await prisma.taskUploadLink.count({ where: { task_id: taskId } });
  return NextResponse.json({ linked: count });
}

// DELETE { links: UploadRef[] } — bulk-remove upload links
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const taskId = parseInt(id);
  const { links } = await req.json() as { links: UploadRef[] };

  await prisma.$transaction(
    links.map(({ upload_id, upload_table }) =>
      prisma.taskUploadLink.delete({
        where: { task_id_upload_id_upload_table: { task_id: taskId, upload_id, upload_table } },
      })
    )
  );

  return new NextResponse(null, { status: 204 });
}
