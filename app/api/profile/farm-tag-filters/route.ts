import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/lab-db";

// The signed-in user's farm-tag include/exclude rules (Dashboard Filters dialog). Separate
// from /api/profile/project-filters because, unlike project/farm selections, Agronomists may
// set these too: getEffectiveScope() only ever narrows their admin-set ceiling with them.
export async function GET() {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [rules, tags] = await Promise.all([
    prisma.userFarmTagFilter.findMany({ where: { user_id: session.user.id }, select: { tag_id: true, mode: true } }),
    prisma.farmTag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return NextResponse.json({
    include: rules.filter((r) => r.mode === "include").map((r) => r.tag_id),
    exclude: rules.filter((r) => r.mode === "exclude").map((r) => r.tag_id),
    tags,
  });
  });
}

export async function PUT(req: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const toIds = (v: unknown): number[] =>
    Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n)) : [];
  const exclude = toIds(body.exclude);
  // A tag can't be both — exclude wins, matching how getEffectiveScope() would resolve it.
  const include = toIds(body.include).filter((id) => !exclude.includes(id));

  const valid = new Set(
    (await prisma.farmTag.findMany({ where: { id: { in: [...include, ...exclude] } }, select: { id: true } }))
      .map((t) => t.id)
  );
  const data = [
    ...include.filter((id) => valid.has(id)).map((tag_id) => ({ user_id: userId, tag_id, mode: "include" })),
    ...exclude.filter((id) => valid.has(id)).map((tag_id) => ({ user_id: userId, tag_id, mode: "exclude" })),
  ];

  await prisma.$transaction([
    prisma.userFarmTagFilter.deleteMany({ where: { user_id: userId } }),
    ...(data.length > 0 ? [prisma.userFarmTagFilter.createMany({ data, skipDuplicates: true })] : []),
  ]);

  return NextResponse.json({
    include: data.filter((d) => d.mode === "include").map((d) => d.tag_id),
    exclude: data.filter((d) => d.mode === "exclude").map((d) => d.tag_id),
  });
  });
}
