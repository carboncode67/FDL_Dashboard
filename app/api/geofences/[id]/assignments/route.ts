import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { ASSIGNMENT_INCLUDE, resolveTargetLabel } from "@/lib/geofences";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assignments = await prisma.geofenceAssignment.findMany({
    where: { geofence_id: parseInt(id) },
    include: ASSIGNMENT_INCLUDE,
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json(
    assignments.map((a) => ({
      id: a.id,
      contact_id: a.contact_id,
      user_id: a.user_id,
      farm_id: a.farm_id,
      farm_experiment_id: a.farm_experiment_id,
      target_label: resolveTargetLabel(a),
    }))
  );
}

// Body: exactly one of contact_id / user_id / farm_id / farm_experiment_id.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const geofenceId = parseInt(id);
  const body = (await req.json()) as {
    contact_id?: number | null;
    user_id?: string | null;
    farm_id?: number | null;
    farm_experiment_id?: number | null;
  };

  const targets = [body.contact_id, body.user_id, body.farm_id, body.farm_experiment_id].filter(
    (v) => v !== undefined && v !== null
  );
  if (targets.length !== 1) {
    return NextResponse.json(
      { error: "Exactly one of contact_id, user_id, farm_id, farm_experiment_id is required" },
      { status: 400 }
    );
  }

  const assignment = await prisma.geofenceAssignment.create({
    data: {
      geofence_id: geofenceId,
      contact_id: body.contact_id ?? null,
      user_id: body.user_id ?? null,
      farm_id: body.farm_id ?? null,
      farm_experiment_id: body.farm_experiment_id ?? null,
    },
    include: ASSIGNMENT_INCLUDE,
  });
  return NextResponse.json(
    { ...assignment, target_label: resolveTargetLabel(assignment) },
    { status: 201 }
  );
}
