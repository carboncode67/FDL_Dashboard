import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";
import { getPointDataCounts } from "@/lib/sampling-point-data";

type Params = { params: Promise<{ id: string; pointId: string }> };

export async function PUT(req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pointId } = await params;
  const body = await req.json();
  const { label, geometry, experiment_test_id, polygon_id } = body;

  // A point with attributed data (form responses / collections) is pinned in place: moving it
  // afterwards would make the map disagree with where that data was actually collected. Label
  // and linked-test edits stay allowed.
  if (geometry !== undefined || polygon_id !== undefined) {
    const existing = (await getPointDataCounts([parseInt(pointId)])).get(parseInt(pointId)) ?? 0;
    if (existing > 0) {
      return NextResponse.json(
        { error: "This point has collected data attributed to it, so its position can no longer be changed." },
        { status: 409 },
      );
    }
  }

  const point = await prisma.samplingPoint.update({
    where: { id: parseInt(pointId) },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(geometry !== undefined ? { geometry } : {}),
      ...(experiment_test_id !== undefined ? { experiment_test_id: experiment_test_id ? parseInt(experiment_test_id) : null } : {}),
      ...(polygon_id !== undefined ? { polygon_id: polygon_id ? parseInt(polygon_id) : null } : {}),
    },
  });
  return NextResponse.json(point);
  });
}

export async function DELETE(_: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pointId } = await params;
  await prisma.samplingPoint.delete({ where: { id: parseInt(pointId) } });
  return new NextResponse(null, { status: 204 });
  });
}
