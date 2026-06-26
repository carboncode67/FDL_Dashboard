import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const filters = await prisma.userProjectFilter.findMany({
    where: { user_id: session.user.id },
    select: { project_id: true },
  });
  return NextResponse.json({ project_ids: filters.map((f) => f.project_id) });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const project_ids: number[] = Array.isArray(body.project_ids) ? body.project_ids : [];

  await prisma.$transaction([
    prisma.userProjectFilter.deleteMany({ where: { user_id: session.user.id } }),
    ...(project_ids.length > 0
      ? [prisma.userProjectFilter.createMany({
          data: project_ids.map((pid) => ({ user_id: session.user.id, project_id: pid })),
          skipDuplicates: true,
        })]
      : []),
  ]);

  return NextResponse.json({ project_ids });
}
