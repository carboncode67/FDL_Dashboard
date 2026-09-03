import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const geofences = await prisma.geofence.findMany({
    include: { _count: { select: { Zones: true, Assignments: true, Events: true } } },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(geofences);
}

type ZoneInput = {
  farm_id: number;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  field_ids: number[];
};

// A geofence is meaningless without at least one zone (each with at least one field), so
// unlike Forms (which can exist with zero fields), zones are required at creation — no
// separate "create shell, then edit" step. Assignment is auto-derived from the zones' farms
// (one GeofenceAssignment per distinct farm_id, deduped) rather than picked manually — see
// components/geofence-assignment-picker.tsx for the still-available manual/supplementary path
// on the edit page.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    notify_on_circle_entry?: boolean;
    notify_on_field_entry?: boolean;
    action_message?: string | null;
    zones?: ZoneInput[];
  };

  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  const zones = body.zones ?? [];
  if (zones.length === 0) return NextResponse.json({ error: "At least one zone is required" }, { status: 400 });
  for (const z of zones) {
    if (!z.farm_id || !Array.isArray(z.field_ids) || z.field_ids.length === 0) {
      return NextResponse.json({ error: "Each zone needs a farm_id and at least one field_id" }, { status: 400 });
    }
  }

  const distinctFarmIds = [...new Set(zones.map((z) => z.farm_id))];

  const geofence = await prisma.$transaction(async (tx) => {
    const created = await tx.geofence.create({
      data: {
        title: body.title!.trim(),
        description: body.description ?? null,
        notify_on_circle_entry: body.notify_on_circle_entry ?? true,
        notify_on_field_entry: body.notify_on_field_entry ?? false,
        action_message: body.action_message?.trim() || null,
        created_by_id: session.user.id,
      },
    });

    for (const z of zones) {
      const zone = await tx.geofenceZone.create({
        data: {
          geofence_id: created.id,
          farm_id: z.farm_id,
          center_lat: z.center_lat,
          center_lng: z.center_lng,
          radius_meters: z.radius_meters,
        },
      });
      await tx.geofenceZoneField.createMany({
        data: z.field_ids.map((field_id) => ({ zone_id: zone.id, field_id })),
      });
    }

    await tx.geofenceAssignment.createMany({
      data: distinctFarmIds.map((farm_id) => ({ geofence_id: created.id, farm_id })),
    });

    return created;
  });

  return NextResponse.json(geofence, { status: 201 });
}
