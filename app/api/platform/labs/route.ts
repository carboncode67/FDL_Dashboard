import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";

// Platform admins only — lists every lab so the header switcher can offer
// them. Deliberately uses basePrisma (public.labs has no lab_id / RLS of its
// own, and a platform admin must be able to see labs other than their home
// one to switch into them at all).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.platform_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const labs = await basePrisma.lab.findMany({
    where: { is_active: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ labs });
}
