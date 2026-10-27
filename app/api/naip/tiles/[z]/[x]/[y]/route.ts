import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { fetchNaipTile, processingConfigured } from "@/lib/processing";

// On-demand NAIP imagery for the sampling-map "basemap from bounding box"
// feature. The browser only ever talks to this session-authed route (same
// shape as /api/basemaps/[id]/tiles/...); it proxies to PipelineProcessor,
// whose PROCESSING_API_KEY the browser must never hold. Leaflet template:
//   /api/naip/tiles/{z}/{x}/{y}.jpg[?year=2022]
// (the extension rides on the y segment, as in the basemap tile route — the
// body is JPEG, or PNG for a partially-covered edge tile; Content-Type says
// which, the extension is only there to satisfy the URL template.)
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!processingConfigured) {
      return NextResponse.json({ error: "Processing service not configured" }, { status: 503 });
    }

    const { z, x, y: yRaw } = await params;
    const yMatch = yRaw.match(/^(\d+)(?:\.(?:jpg|png))?$/);
    if (!/^\d{1,2}$/.test(z) || !/^\d{1,8}$/.test(x) || !yMatch) {
      return NextResponse.json({ error: "Invalid tile coordinates" }, { status: 400 });
    }
    const yearRaw = new URL(req.url).searchParams.get("year");
    if (yearRaw !== null && !/^(19|20)\d{2}$/.test(yearRaw)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    try {
      const tile = await fetchNaipTile(Number(z), Number(x), Number(yMatch[1]), yearRaw ? Number(yearRaw) : undefined);
      // No-coverage is stable, so it's safe to let the browser cache it; an
      // upstream failure (below) deliberately carries no cache header.
      if (!tile) {
        return NextResponse.json(
          { error: "No NAIP coverage" },
          { status: 404, headers: { "Cache-Control": "private, max-age=3600" } }
        );
      }
      return new NextResponse(tile.body, {
        headers: { "Content-Type": tile.contentType, "Cache-Control": "private, max-age=86400" },
      });
    } catch (e) {
      console.error("NAIP tile proxy failed:", e);
      return NextResponse.json({ error: "Imagery service unavailable" }, { status: 502 });
    }
  });
}
