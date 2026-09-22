import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";

export async function GET() {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const geofences = await prisma.geofence.findMany({
    include: {
      _count: { select: { Zones: true, Assignments: true, Events: true, TimeSessions: true } },
    },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(geofences);
  });
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
//
// geofence_type is chosen once at creation and never editable afterward (see PUT below) — to
// change it, delete and recreate, same precedent as zone immutability. 'duration' geofences
// are always circle-level only (notify_on_field_entry forced false, no link allowed); the two
// repeat-interval fields and the link fields are validated against geofence_type here to keep
// the DB CHECK constraints (migration 078) from ever actually firing on well-behaved input.
export async function POST(req: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    geofence_type?: string;
    notify_on_circle_entry?: boolean;
    notify_on_field_entry?: boolean;
    circle_repeat_interval_days?: number;
    field_repeat_interval_days?: number;
    linked_form_id?: number | null;
    linked_sampling_map_id?: number | null;
    action_message?: string | null;
    zones?: ZoneInput[];
  };

  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  const geofenceType = body.geofence_type;
  if (geofenceType !== "duration" && geofenceType !== "notification") {
    return NextResponse.json({ error: "geofence_type must be 'duration' or 'notification'" }, { status: 400 });
  }
  const zones = body.zones ?? [];
  if (zones.length === 0) return NextResponse.json({ error: "At least one zone is required" }, { status: 400 });
  for (const z of zones) {
    if (!z.farm_id || !Array.isArray(z.field_ids) || z.field_ids.length === 0) {
      return NextResponse.json({ error: "Each zone needs a farm_id and at least one field_id" }, { status: 400 });
    }
  }

  const circleInterval = body.circle_repeat_interval_days ?? 1;
  const fieldInterval = body.field_repeat_interval_days ?? 1;
  if (!Number.isInteger(circleInterval) || circleInterval < 1 || !Number.isInteger(fieldInterval) || fieldInterval < 1) {
    return NextResponse.json({ error: "Repeat interval must be a whole number of days, at least 1" }, { status: 400 });
  }

  const notifyOnCircleEntry = geofenceType === "duration" ? true : body.notify_on_circle_entry ?? true;
  const notifyOnFieldEntry = geofenceType === "duration" ? false : body.notify_on_field_entry ?? false;
  if (geofenceType === "notification" && !notifyOnCircleEntry && !notifyOnFieldEntry) {
    return NextResponse.json({ error: "Notification geofences need at least one of circle/field entry enabled" }, { status: 400 });
  }

  const linkedFormId = geofenceType === "notification" ? body.linked_form_id ?? null : null;
  const linkedSamplingMapId = geofenceType === "notification" ? body.linked_sampling_map_id ?? null : null;
  if (linkedFormId && linkedSamplingMapId) {
    return NextResponse.json({ error: "A geofence can link to a Form or a Sampling Map, not both" }, { status: 400 });
  }

  const distinctFarmIds = [...new Set(zones.map((z) => z.farm_id))];

  const geofence = await prisma.$transaction(async (tx) => {
    const created = await tx.geofence.create({
      data: {
        title: body.title!.trim(),
        description: body.description ?? null,
        geofence_type: geofenceType,
        notify_on_circle_entry: notifyOnCircleEntry,
        notify_on_field_entry: notifyOnFieldEntry,
        circle_repeat_interval_days: circleInterval,
        field_repeat_interval_days: fieldInterval,
        linked_form_id: linkedFormId,
        linked_sampling_map_id: linkedSamplingMapId,
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
  });
}
