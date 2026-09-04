import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { ASSIGNMENT_INCLUDE } from "@/lib/sampling-maps";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assignments = await prisma.samplingMapAssignment.findMany({
    where: { sampling_map_id: parseInt(id) },
    include: ASSIGNMENT_INCLUDE,
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json(
    assignments.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      user_label: a.User.name ?? a.User.email,
    }))
  );
}

// Body: { user_id: string }
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const samplingMapId = parseInt(id);
  const body = (await req.json()) as { user_id?: string };

  if (!body.user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const assignment = await prisma.samplingMapAssignment.create({
    data: { sampling_map_id: samplingMapId, user_id: body.user_id },
    include: ASSIGNMENT_INCLUDE,
  });
  return NextResponse.json(
    { id: assignment.id, user_id: assignment.user_id, user_label: assignment.User.name ?? assignment.User.email },
    { status: 201 }
  );
}
