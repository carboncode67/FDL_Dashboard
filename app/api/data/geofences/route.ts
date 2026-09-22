import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { assignmentWhereForContact, assignmentWhereForLabMember } from "@/lib/geofences";

// List geofences assigned to the authenticated identity, with their zones nested. geometry on
// each zone's fields is returned as-is (raw GeoJSON string, never parsed server-side) for the
// client to JSON.parse — same convention as /api/data/fields.
export async function GET(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const where =
    auth.kind === "contact"
      ? { is_active: true, Assignments: assignmentWhereForContact(auth.contact) }
      : { is_active: true, Assignments: assignmentWhereForLabMember(auth.labMember.id) };

  const geofences = await prisma.geofence.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: {
      Zones: {
        include: {
          Farm: { select: { Farm_Name: true } },
          Fields: { include: { Field: { select: { id: true, Name: true, geometry: true } } } },
        },
      },
      LinkedForm: { select: { id: true, title: true } },
      LinkedSamplingMap: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    geofences.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      action_message: g.action_message,
      geofence_type: g.geofence_type,
      notify_on_circle_entry: g.notify_on_circle_entry,
      notify_on_field_entry: g.notify_on_field_entry,
      circle_repeat_interval_days: g.circle_repeat_interval_days,
      field_repeat_interval_days: g.field_repeat_interval_days,
      linked_form: g.LinkedForm ? { id: g.LinkedForm.id, title: g.LinkedForm.title } : null,
      linked_sampling_map: g.LinkedSamplingMap ? { id: g.LinkedSamplingMap.id, name: g.LinkedSamplingMap.name } : null,
      zones: g.Zones.map((z) => ({
        id: z.id,
        farm_id: z.farm_id,
        farm_name: z.Farm.Farm_Name,
        center_lat: z.center_lat,
        center_lng: z.center_lng,
        radius_meters: z.radius_meters,
        fields: z.Fields.map((zf) => ({ id: zf.Field.id, name: zf.Field.Name, geometry: zf.Field.geometry })),
      })),
    }))
  );
  });
}
