import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";

export async function GET() {
  const fields = await prisma.field.findMany({ orderBy: { id: "asc" }, include: { Farm: true } });
  return NextResponse.json(fields);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  // Batch create: { Farms_id, fields: [{ Name, boundary_source }, ...] }
  if (Array.isArray(body?.fields)) {
    if (body.fields.length === 0) {
      return NextResponse.json({ error: "At least one field is required" }, { status: 400 });
    }
    if (body.fields.some((f: { Name?: string }) => !f?.Name?.trim())) {
      return NextResponse.json({ error: "Every field needs a name" }, { status: 400 });
    }
    const created = await prisma.$transaction(
      body.fields.map((f: { Name: string; boundary_source?: string | null }) =>
        prisma.field.create({
          data: { Name: f.Name, boundary_source: f.boundary_source ?? null, Farms_id: body.Farms_id ?? null },
        }),
      ),
    );
    return NextResponse.json(created, { status: 201 });
  }

  const field = await prisma.field.create({ data: body });
  return NextResponse.json(field, { status: 201 });
}
