import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { ACTION_TYPES } from "@/lib/geofences";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const geofences = await prisma.geofence.findMany({
    include: { _count: { select: { Assignments: true, Events: true } } },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(geofences);
}

// A geofence is meaningless without a boundary, so unlike Forms (which can
// exist with zero fields), geometry + action_message are required at
// creation — there's no separate "create shell, then edit" step.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    geometry?: string;
    action_type?: string;
    action_message?: string;
  };
  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!body.geometry?.trim()) return NextResponse.json({ error: "geometry is required" }, { status: 400 });
  if (!body.action_message?.trim()) return NextResponse.json({ error: "action_message is required" }, { status: 400 });
  const actionType = body.action_type ?? "notification";
  if (!ACTION_TYPES.has(actionType)) {
    return NextResponse.json({ error: `Invalid action_type: ${actionType}` }, { status: 400 });
  }

  const geofence = await prisma.geofence.create({
    data: {
      title: body.title.trim(),
      description: body.description ?? null,
      geometry: body.geometry,
      action_type: actionType,
      action_message: body.action_message.trim(),
      created_by_id: session.user.id,
    },
  });
  return NextResponse.json(geofence, { status: 201 });
}
