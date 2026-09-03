import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
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
    },
  });
  if (!geofence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(geofence);
}

// Zone editing is out of scope for this pass — to change a geofence's zones, delete and
// recreate it (see components/geofence-zone-map.tsx's design note). PUT only touches the
// geofence-level fields.
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    is_active?: boolean;
    notify_on_circle_entry?: boolean;
    notify_on_field_entry?: boolean;
    action_message?: string | null;
  };

  const geofence = await prisma.geofence.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      ...(body.notify_on_circle_entry !== undefined ? { notify_on_circle_entry: body.notify_on_circle_entry } : {}),
      ...(body.notify_on_field_entry !== undefined ? { notify_on_field_entry: body.notify_on_field_entry } : {}),
      ...(body.action_message !== undefined ? { action_message: body.action_message?.trim() || null } : {}),
    },
  });
  return NextResponse.json(geofence);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.geofence.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
