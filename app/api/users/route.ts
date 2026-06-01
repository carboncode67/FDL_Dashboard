import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name: name || null, email, password: hashed },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  return NextResponse.json(user, { status: 201 });
}
