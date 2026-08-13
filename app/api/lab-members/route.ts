import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const USER_SELECT = {
  id: true, name: true, email: true, role: true, bearer_token: true,
  position: true, contact_phone: true, faa_part_107: true, status: true,
  onboarded_at: true, createdAt: true, updatedAt: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: USER_SELECT });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, email, password, position, phone, faa_part_107, status } = body;
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const hashed = password
    ? await bcrypt.hash(password, 12)
    : "__disabled__";

  try {
    const user = await prisma.user.create({
      data: {
        name: name || null,
        email,
        password: hashed,
        role: "member",
        position: position || null,
        contact_phone: phone || null,
        faa_part_107: faa_part_107 ?? false,
        status: status || null,
        bearer_token: crypto.randomBytes(32).toString("hex"),
      },
      select: USER_SELECT,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    throw err;
  }
}
