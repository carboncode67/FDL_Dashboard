import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { initiateBasemapS3Upload } from "@/lib/s3-uploads";

// Start a presigned multipart upload of a basemap GeoTIFF straight to the S3
// bucket (docs/garage-s3-upload-plan.md). Body: { farm_id, filename, size,
// display_name?, crs_override_epsg?, drone_flight_record_id? }. Returns
// { id, part_size, part_count }; the browser then calls ./[id]/sign,
// PUTs the parts, and calls ./[id]/complete. See lib/s3-multipart-client.ts.
export const runtime = "nodejs";

export async function POST(request: Request) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json().catch(() => null);
    const scope = await getEffectiveScope(session.user.id, session.user.category);
    try {
      return await initiateBasemapS3Upload(body, {
        uploadedById: session.user.id,
        canAccessFarm: (farmId) => scopeIncludesFarm(scope, farmId),
      });
    } catch (e) {
      console.error("[s3-uploads] initiate", e);
      return NextResponse.json({ error: "Storage request failed" }, { status: 502 });
    }
  });
}
