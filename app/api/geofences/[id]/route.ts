import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const geofence = await prisma.geofence.findUnique({
    where: { id: parseInt(id) },
    include: {
      Zones: {
        include: {
          Farm: { select: { Farm_Name: true } },
          Fields: { include: { Field: { select: { id: true, Name: true } } } },
        },
      },
      LinkedForm: { select: { id: true, title: true } },
      LinkedSamplingMap: { select: { id: true, name: true } },
    },
  });
  if (!geofence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(geofence);
  });
}

// Zone editing is out of scope for this pass — to change a geofence's zones, delete and
// recreate it (see components/geofence-zone-map.tsx's design note). geofence_type is likewise
// not editable here — same "delete and recreate to change" precedent — so PUT only touches
// the remaining geofence-level fields. notify_on_field_entry/link fields are still validated
// against the *existing* geofence_type, since a 'duration' geofence should never end up with
// them set even though nothing in this route lets its type change.
export async function PUT(req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.geofence.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    is_active?: boolean;
    notify_on_circle_entry?: boolean;
    notify_on_field_entry?: boolean;
    circle_repeat_interval_days?: number;
    field_repeat_interval_days?: number;
    linked_form_id?: number | null;
    linked_sampling_map_id?: number | null;
    action_message?: string | null;
  };

  if (body.circle_repeat_interval_days !== undefined && (!Number.isInteger(body.circle_repeat_interval_days) || body.circle_repeat_interval_days < 1)) {
    return NextResponse.json({ error: "circle_repeat_interval_days must be a whole number of days, at least 1" }, { status: 400 });
  }
  if (body.field_repeat_interval_days !== undefined && (!Number.isInteger(body.field_repeat_interval_days) || body.field_repeat_interval_days < 1)) {
    return NextResponse.json({ error: "field_repeat_interval_days must be a whole number of days, at least 1" }, { status: 400 });
  }

  const isDuration = existing.geofence_type === "duration";
  const linkedFormId = isDuration ? null : body.linked_form_id !== undefined ? body.linked_form_id : undefined;
  const linkedSamplingMapId = isDuration ? null : body.linked_sampling_map_id !== undefined ? body.linked_sampling_map_id : undefined;
  if (linkedFormId && linkedSamplingMapId) {
    return NextResponse.json({ error: "A geofence can link to a Form or a Sampling Map, not both" }, { status: 400 });
  }

  const geofence = await prisma.geofence.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      ...(!isDuration && body.notify_on_circle_entry !== undefined ? { notify_on_circle_entry: body.notify_on_circle_entry } : {}),
      ...(!isDuration && body.notify_on_field_entry !== undefined ? { notify_on_field_entry: body.notify_on_field_entry } : {}),
      ...(body.circle_repeat_interval_days !== undefined ? { circle_repeat_interval_days: body.circle_repeat_interval_days } : {}),
      ...(body.field_repeat_interval_days !== undefined ? { field_repeat_interval_days: body.field_repeat_interval_days } : {}),
      ...(linkedFormId !== undefined ? { linked_form_id: linkedFormId } : {}),
      ...(linkedSamplingMapId !== undefined ? { linked_sampling_map_id: linkedSamplingMapId } : {}),
      ...(body.action_message !== undefined ? { action_message: body.action_message?.trim() || null } : {}),
    },
    include: { LinkedForm: { select: { id: true, title: true } }, LinkedSamplingMap: { select: { id: true, name: true } } },
  });
  return NextResponse.json(geofence);
  });
}

// Deleting a geofence cascades to its zones, assignments, events and time sessions. One with
// logged time sessions can only be deleted once the caller confirms the time-sessions CSV was
// downloaded (?confirm_exported=true, sent by the edit page only after that download).
export async function DELETE(req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const geofenceId = parseInt(id);
  const sessionCount = await prisma.geofenceZoneTimeSession.count({ where: { geofence_id: geofenceId } });
  if (sessionCount > 0 && new URL(req.url).searchParams.get("confirm_exported") !== "true") {
    return NextResponse.json(
      { error: `This geofence has ${sessionCount} logged time session(s). Download the time-sessions CSV before deleting it.` },
      { status: 409 },
    );
  }
  await prisma.geofence.delete({ where: { id: geofenceId } });
  return new NextResponse(null, { status: 204 });
  });
}
