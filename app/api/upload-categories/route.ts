import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.uploadCategory.findMany({
    orderBy: { sort_order: "asc" },
    include: { Metrics: { orderBy: { sort_order: "asc" } } },
  });
  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user.role ?? "viewer") as Role;
  if (!canCreate(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const media_types = Array.isArray(body.media_types)
    ? body.media_types.filter((t: unknown) => typeof t === "string")
    : [];

  const maxOrder = await prisma.uploadCategory.aggregate({ _max: { sort_order: true } });

  try {
    const category = await prisma.uploadCategory.create({
      data: {
        name,
        media_types,
        sort_order: (maxOrder._max.sort_order ?? -1) + 1,
      },
      include: { Metrics: true },
    });
    return NextResponse.json(category, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}
