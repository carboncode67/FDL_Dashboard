import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { receiveYieldCardUpload } from "@/lib/farm-uploads";

// Unified farm upload box, "clean this yield card" choice: a zipped CN1 card
// → PipelineProcessor's yieldclean job (lib/yield-runs.ts).
export const runtime = "nodejs";
// A whole display card can run to hundreds of MB.
export const maxDuration = 3600;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });
  return receiveYieldCardUpload(request, farmId, session.user.id);
  });
}
