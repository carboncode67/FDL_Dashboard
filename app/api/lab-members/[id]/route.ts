import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import bcrypt from "bcryptjs";

const USER_SELECT = {
  id: true, name: true, email: true, role: true, bearer_token: true,
  position: true, contact_phone: true, faa_part_107: true, status: true,
  onboarded_at: true, createdAt: true, updatedAt: true,
} as const;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { name, position, phone, faa_part_107, status, password } = await req.json();

  if (password && password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: name || null,
        position: position || null,
        contact_phone: phone || null,
        faa_part_107: faa_part_107 ?? false,
        status: status || null,
        ...(password ? { password: await bcrypt.hash(password, 12) } : {}),
      },
      select: USER_SELECT,
    });
    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Lab member not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await prisma.user.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return NextResponse.json({ error: "Lab member not found" }, { status: 404 });
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "This lab member is still referenced by other records and can't be deleted. Run the latest DB migrations, or contact an admin." },
          { status: 409 }
        );
      }
    }
    throw err;
  }
}
