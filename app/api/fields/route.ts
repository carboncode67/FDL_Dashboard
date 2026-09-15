import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";

export async function GET() {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  const where = scope.hardScoped ? { Farms_id: { in: scope.farmIds } } : {};
  const fields = await prisma.field.findMany({ where, orderBy: { id: "asc" }, include: { Farm: true } });
  return NextResponse.json(fields);
  });
}

export async function POST(req: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  const targetFarmId: number | null | undefined = body?.Farms_id;
  if (targetFarmId != null && !scopeIncludesFarm(scope, targetFarmId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
  });
}
