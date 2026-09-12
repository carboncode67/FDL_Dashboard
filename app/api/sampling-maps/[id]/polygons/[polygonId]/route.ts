import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";

type Params = { params: Promise<{ id: string; polygonId: string }> };

export async function PUT(req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { polygonId } = await params;
  const body = await req.json();
  const { label, purpose, geometry } = body;

  const polygon = await prisma.samplingMapPolygon.update({
    where: { id: parseInt(polygonId) },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(purpose !== undefined ? { purpose } : {}),
      ...(geometry !== undefined ? { geometry } : {}),
    },
  });
  return NextResponse.json(polygon);
  });
}

export async function DELETE(_: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { polygonId } = await params;
  // Points generated within this polygon are kept (polygon_id is nullable, ON DELETE SET NULL)
  // rather than cascade-deleted — deleting a stratum shouldn't silently destroy sample records.
  await prisma.samplingMapPolygon.delete({ where: { id: parseInt(polygonId) } });
  return new NextResponse(null, { status: 204 });
  });
}
