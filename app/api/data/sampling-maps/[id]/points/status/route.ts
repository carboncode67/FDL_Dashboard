import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { isSamplingMapVisibleToLabMember } from "@/lib/sampling-maps";

type Params = { params: Promise<{ id: string }> };

// Incremental "what's changed since I last checked" feed for a Sampling Map's collections —
// lets multiple lab members surveying the same field see each other's completed points without
// waiting for someone to redownload the whole map. Deliberately a separate, cheap endpoint from
// GET /api/data/sampling-maps/{id} (full geometry) rather than adding collection status to that
// payload: the mobile app polls this one on a short interval while the map screen is open, and
// keeping it to just the collections table means a poll only ever costs a small indexed query.
//
// Cursor is the server's own `received_at` (insert time), not `occurred_at` (the client's GPS
// timestamp, which can be skewed or arrive out of order after an offline device catches up) --
// `received_at` only ever increases as rows are created, so "give me everything with
// received_at > since" can't skip a row no matter when it was collected in the field.
// Query param: since (optional ISO timestamp; omit for a full history fetch).
export async function GET(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    if (auth.kind !== "labMember")
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { id } = await params;
    const samplingMapId = parseInt(id);
    if (isNaN(samplingMapId))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const visible = await isSamplingMapVisibleToLabMember(
      samplingMapId,
      auth.labMember.id,
    );
    if (!visible)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sinceRaw = new URL(request.url).searchParams.get("since");
    let since: Date | null = null;
    if (sinceRaw) {
      since = new Date(sinceRaw);
      if (isNaN(since.getTime()))
        return NextResponse.json(
          { error: "since must be a valid ISO timestamp" },
          { status: 400 },
        );
    }

    const rows = await prisma.samplingPointCollection.findMany({
      where: {
        SamplingPoint: { sampling_map_id: samplingMapId },
        ...(since ? { received_at: { gt: since } } : {}),
      },
      include: { User: { select: { name: true, email: true } } },
      orderBy: { received_at: "asc" },
      take: 1000,
    });

    return NextResponse.json({
      collections: rows.map((r) => ({
        id: r.id,
        sampling_point_id: r.sampling_point_id,
        user_id: r.user_id,
        user_name: r.User?.name || r.User?.email || null,
        occurred_at: r.occurred_at.toISOString(),
        content_hash: r.content_hash,
        received_at: r.received_at.toISOString(),
      })),
    });
  });
}
