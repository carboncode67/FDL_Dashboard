import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { receiveFarmLayerUpload } from "@/lib/farm-uploads";

// Unified farm upload box, "Map layer" choice: stores a vector file or point
// CSV as a named display-only Farm_Layers overlay (migration 089) — see
// receiveFarmLayerUpload() in lib/farm-uploads.ts.
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });
  return receiveFarmLayerUpload(request, farmId, session.user.id);
  });
}
