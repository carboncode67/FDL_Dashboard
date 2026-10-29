import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { receiveBasemapUpload } from "@/lib/farm-uploads";

// Planned Changes items 6+7 (docs/raster-tiling-plan.md): a lab member
// uploads a large raster (typically a drone orthomosaic GeoTIFF, 1-5 GB)
// through the Dashboard UI itself. Session-authed dashboard action, not a
// mobile bearer route — no proxy.ts change needed here, same as any other
// app/api/[entity]/route.ts. The streaming/tiling logic lives in
// lib/farm-uploads.ts, shared with OFE's POST /api/data/farms/[id]/basemaps.
export const runtime = "nodejs";
// 300s was too short for a real multi-GB upload and caused a hard
// ECONNRESET mid-transfer (Next.js enforces maxDuration as a real request
// timeout on self-hosted deployments too, not just Vercel) - confirmed live
// against a 6.3 GB test file on TrueNAS dev, 2026-09-15. 3600s comfortably
// covers a multi-GB transfer; the real fix (presigned direct-to-storage
// upload, bypassing this request's lifecycle entirely) is tracked as a
// follow-up in docs/raster-tiling-plan.md rather than raising this forever.
export const maxDuration = 3600;

export async function POST(request: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return receiveBasemapUpload(request, { uploadedById: session.user.id });
  });
}
