import { NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { isSamplingMapVisibleToContact, isSamplingMapVisibleToLabMember } from "@/lib/sampling-maps";
import { naipPackagePath } from "@/lib/naip-package";

// Mobile download of a sampling map's NAIP imagery package (an MBTiles file —
// see lib/naip-package.ts). The `basemap` object in GET /api/data/sampling-maps/[id]
// tells the app this exists and carries the sha256 to compare against its local
// copy. Supports a single HTTP Range so a large download over a flaky cellular
// connection can resume. Same visibility rule as the map itself.
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const mapId = parseInt((await params).id);
    if (isNaN(mapId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const visible =
      auth.kind === "contact"
        ? await isSamplingMapVisibleToContact(mapId, auth.contact)
        : await isSamplingMapVisibleToLabMember(mapId, auth.labMember.id);
    if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const m = await prisma.samplingMap.findUnique({
      where: { id: mapId },
      select: { naip_package_sha256: true },
    });
    const filePath = naipPackagePath(mapId);
    if (!m?.naip_package_sha256 || !fs.existsSync(filePath)) {
      return NextResponse.json({ error: "No basemap package" }, { status: 404 });
    }

    const size = fs.statSync(filePath).size;
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="map-${mapId}.mbtiles"`,
      "Accept-Ranges": "bytes",
      ETag: `"${m.naip_package_sha256}"`,
      "Cache-Control": "private, no-cache",
    };

    const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      // "bytes=N-M", "bytes=N-" or the suffix form "bytes=-N" (last N bytes).
      let start = range[1] ? parseInt(range[1]) : Math.max(size - parseInt(range[2]), 0);
      const end = range[1] && range[2] ? Math.min(parseInt(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      start = Math.max(start, 0);
      const stream = fs.createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }

    return new NextResponse(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
      headers: { ...headers, "Content-Length": String(size) },
    });
  });
}
