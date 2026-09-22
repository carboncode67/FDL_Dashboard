import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { isGeofenceVisibleToContact, isGeofenceVisibleToLabMember } from "@/lib/geofences";

type Params = { params: Promise<{ id: string }> };

// Log a confirmed on-device 'duration' geofence time session (circle entry -> exit). The
// device already closed the session locally before calling this — no server-side re-
// validation of the reported duration, same "device is authoritative" stance as the sibling
// events route. Body: { zone_id, entered_at (ISO), exited_at (ISO), duration_seconds, content_hash? }
export async function POST(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const { id } = await params;
  const geofenceId = parseInt(id);
  if (isNaN(geofenceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const visible =
    auth.kind === "contact"
      ? await isGeofenceVisibleToContact(geofenceId, auth.contact)
      : await isGeofenceVisibleToLabMember(geofenceId, auth.labMember.id);
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: {
    zone_id?: unknown;
    entered_at?: unknown;
    exited_at?: unknown;
    duration_seconds?: unknown;
    content_hash?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const zoneId = typeof body.zone_id === "number" ? body.zone_id : null;
  const enteredAtRaw = typeof body.entered_at === "string" ? body.entered_at : null;
  const exitedAtRaw = typeof body.exited_at === "string" ? body.exited_at : null;
  const durationSeconds = typeof body.duration_seconds === "number" ? body.duration_seconds : null;
  const contentHash = typeof body.content_hash === "string" ? body.content_hash : null;

  if (zoneId === null || enteredAtRaw === null || exitedAtRaw === null || durationSeconds === null) {
    return NextResponse.json({ error: "zone_id, entered_at, exited_at, and duration_seconds are required" }, { status: 400 });
  }
  const enteredAt = new Date(enteredAtRaw);
  const exitedAt = new Date(exitedAtRaw);
  if (isNaN(enteredAt.getTime()) || isNaN(exitedAt.getTime())) {
    return NextResponse.json({ error: "entered_at and exited_at must be valid ISO timestamps" }, { status: 400 });
  }

  const zone = await prisma.geofenceZone.findUnique({ where: { id: zoneId } });
  if (!zone || zone.geofence_id !== geofenceId) {
    return NextResponse.json({ error: "zone_id does not belong to this geofence" }, { status: 400 });
  }

  const submitterFilter =
    auth.kind === "contact" ? { contact_id: auth.contact.id } : { user_id: auth.labMember.id };

  // Dedup first — scoped to submitter, same as GeofenceEvent/Note/Location dedup.
  if (contentHash) {
    const existing = await prisma.geofenceZoneTimeSession.findFirst({
      where: { geofence_id: geofenceId, content_hash: contentHash, ...submitterFilter },
    });
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }
  }

  const session = await prisma.geofenceZoneTimeSession.create({
    data: {
      geofence_id: geofenceId,
      zone_id: zoneId,
      contact_id: auth.kind === "contact" ? auth.contact.id : null,
      user_id: auth.kind === "labMember" ? auth.labMember.id : null,
      entered_at: enteredAt,
      exited_at: exitedAt,
      duration_seconds: durationSeconds,
      content_hash: contentHash,
    },
  });

  return NextResponse.json({ ok: true, id: session.id }, { status: 201 });
  });
}
