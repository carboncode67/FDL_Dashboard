import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { ACTION_TYPES } from "@/lib/geofences";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const geofence = await prisma.geofence.findUnique({ where: { id: parseInt(id) } });
  if (!geofence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(geofence);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    geometry?: string;
    is_active?: boolean;
    action_type?: string;
    action_message?: string;
  };

  if (body.action_type !== undefined && !ACTION_TYPES.has(body.action_type)) {
    return NextResponse.json({ error: `Invalid action_type: ${body.action_type}` }, { status: 400 });
  }

  const geofence = await prisma.geofence.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.geometry !== undefined ? { geometry: body.geometry } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      ...(body.action_type !== undefined ? { action_type: body.action_type } : {}),
      ...(body.action_message !== undefined ? { action_message: body.action_message } : {}),
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
