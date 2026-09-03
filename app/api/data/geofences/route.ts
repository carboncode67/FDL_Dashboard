import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { assignmentWhereForContact, assignmentWhereForLabMember } from "@/lib/geofences";

// List geofences assigned to the authenticated identity. Unlike Forms, the
// full payload (including geometry) is small enough to return in one shot —
// no separate list/detail split needed. geometry is returned as-is (raw
// GeoJSON string, never parsed server-side) for the client to JSON.parse.
export async function GET(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  const where =
    auth.kind === "contact"
      ? { is_active: true, Assignments: assignmentWhereForContact(auth.contact) }
      : { is_active: true, Assignments: assignmentWhereForLabMember(auth.labMember.id) };

  const geofences = await prisma.geofence.findMany({
    where,
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json(
    geofences.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      geometry: g.geometry,
      action_type: g.action_type,
      action_message: g.action_message,
    }))
  );
}
