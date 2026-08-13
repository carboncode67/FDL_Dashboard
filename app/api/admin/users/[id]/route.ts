import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEditMode } from "@/lib/edit-mode";

const VALID_ROLES = ["admin", "member", "viewer"] as const;
type Role = (typeof VALID_ROLES)[number];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { role } = await req.json();

  if (!VALID_ROLES.includes(role as Role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (id === session.user.id && role !== "admin") {
    return NextResponse.json({ error: "Cannot remove your own admin role" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json(user);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const editMode = await getEditMode();
  if (!editMode) return NextResponse.json({ error: "Edit mode is off" }, { status: 403 });

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "This user is still referenced by other records and can't be deleted. Run the latest DB migrations, or contact an admin." },
          { status: 409 }
        );
      }
    }
    throw err;
  }
}
