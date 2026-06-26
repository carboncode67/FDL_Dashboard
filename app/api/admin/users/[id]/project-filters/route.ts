import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const filters = await prisma.userProjectFilter.findMany({
    where: { user_id: id },
    select: { project_id: true },
  });
  return NextResponse.json({ project_ids: filters.map((f) => f.project_id) });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const project_ids: number[] = Array.isArray(body.project_ids) ? body.project_ids : [];

  await prisma.$transaction([
    prisma.userProjectFilter.deleteMany({ where: { user_id: id } }),
    ...(project_ids.length > 0
      ? [prisma.userProjectFilter.createMany({
          data: project_ids.map((pid) => ({ user_id: id, project_id: pid })),
          skipDuplicates: true,
        })]
      : []),
  ]);

  return NextResponse.json({ project_ids });
}
