import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forms = await prisma.form.findMany({
    include: { _count: { select: { FieldDefinitions: true, Assignments: true, Responses: true } } },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(forms);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { title?: string; description?: string | null };
  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const form = await prisma.form.create({
    data: {
      title: body.title.trim(),
      description: body.description ?? null,
      created_by_id: session.user.id,
    },
  });
  return NextResponse.json(form, { status: 201 });
}
