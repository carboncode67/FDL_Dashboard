import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";

type Params = { params: Promise<{ id: string }> };

interface PointInput {
  polygon_id?: number | null;
  experiment_test_id?: number | null;
  label?: string | null;
  geometry: string;
  placement_method?: string;
  sample_index?: number | null;
}

// Accepts either one point (manual placement) or { points: [...] } — a batch accepted from the
// grid/random generation preview. Both write through prisma.$transaction so a batch either
// lands completely or not at all.
export async function POST(req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const samplingMapId = parseInt(id);
  const body = await req.json();

  const inputs: PointInput[] = Array.isArray(body?.points) ? body.points : [body];
  if (inputs.length === 0) return NextResponse.json({ error: "At least one point is required" }, { status: 400 });
  if (inputs.some((p) => !p?.geometry)) {
    return NextResponse.json({ error: "Every point needs a geometry" }, { status: 400 });
  }

  const created = await prisma.$transaction(
    inputs.map((p) =>
      prisma.samplingPoint.create({
        data: {
          sampling_map_id: samplingMapId,
          polygon_id: p.polygon_id ?? null,
          experiment_test_id: p.experiment_test_id ?? null,
          label: p.label ?? null,
          geometry: p.geometry,
          placement_method: p.placement_method ?? "manual",
          sample_index: p.sample_index ?? null,
        },
      }),
    ),
  );
  return NextResponse.json(created, { status: 201 });
  });
}
