import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { retileBasemap } from "@/lib/farm-uploads";

// The "Retry" link next to a not-ready basemap under the farm map — see
// retileBasemap() in lib/farm-uploads.ts.
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  return retileBasemap(parseInt(id));
  });
}
