import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { normalizeTagName } from "@/lib/farm-tags";

// Lab's farm-tag vocabulary with usage counts — backs the tag picker, the Manage Tags
// dialog and the Dashboard Filters tag section.
export async function GET() {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tags = await prisma.farmTag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { Links: true } } },
  });
  return NextResponse.json(tags.map((t) => ({ id: t.id, name: t.name, farm_count: t._count.Links })));
  });
}

// Any signed-in user may create tags (viewers included, by design). Returns the existing tag
// when one with the same name (case-insensitive) already exists, so "Dairy" and "dairy " never
// become two tags.
export async function POST(req: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = normalizeTagName(body.name);
  if (!name) return NextResponse.json({ error: "Tag name must be 1–40 characters" }, { status: 400 });

  const existing = await prisma.farmTag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return NextResponse.json({ id: existing.id, name: existing.name });

  const tag = await prisma.farmTag.create({ data: { name } });
  return NextResponse.json({ id: tag.id, name: tag.name }, { status: 201 });
  });
}
