import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { withVisionJob } from "@/lib/vision-route";
import { BACKGROUND_COLOR, VISION_PALETTE, VisionInputError, setBasemapSources, syncPhotoSources } from "@/lib/vision";

// Edit a vision job: { add_classes?: string[], remove_class_ids?: number[],
// basemap_ids?: number[], mode?: "detection" | "segmentation" }. Removing a
// class deletes its labels (and predictions); the background class can't go.
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return withVisionJob(jobId, { edit: true }, async ({ session, jobId }) => {
    const body = (await req.json().catch(() => ({}))) as {
      add_classes?: unknown; remove_class_ids?: unknown; basemap_ids?: unknown; mode?: unknown;
    };

    if (Array.isArray(body.add_classes)) {
      const existing = await prisma.visionClass.findMany({ where: { job_id: jobId } });
      const names = new Set(existing.map((c) => c.name.toLowerCase()));
      const add = Array.from(new Set(body.add_classes.filter((c): c is string => typeof c === "string").map((c) => c.trim()).filter(Boolean)))
        .filter((n) => !names.has(n.toLowerCase()));
      if (existing.length + add.length > 21) throw new VisionInputError("At most 20 classes");
      const fg = existing.filter((c) => !c.is_background).length;
      if (add.length) {
        await prisma.visionClass.createMany({
          data: add.map((name, i) => ({
            job_id: jobId, name, color: VISION_PALETTE[(fg + i) % VISION_PALETTE.length] ?? BACKGROUND_COLOR,
            sort_order: existing.length + i,
          })),
        });
      }
    }
    if (Array.isArray(body.remove_class_ids)) {
      const ids = body.remove_class_ids.map(Number).filter(Number.isInteger);
      await prisma.visionClass.deleteMany({ where: { job_id: jobId, id: { in: ids }, is_background: false } });
    }
    if (Array.isArray(body.basemap_ids)) {
      const ids = body.basemap_ids.map(Number).filter(Number.isInteger);
      const farms = await prisma.basemap.findMany({ where: { id: { in: ids } }, select: { farm_id: true } });
      const scope = await getEffectiveScope(session.user.id ?? null, session.user.category);
      if (farms.length !== ids.length || farms.some((b) => !scopeIncludesFarm(scope, b.farm_id))) {
        throw new VisionInputError("One of those basemaps isn't available to you");
      }
      await setBasemapSources(jobId, ids);
    }
    if (body.mode === "detection" || body.mode === "segmentation") {
      await prisma.visionJob.update({ where: { id: jobId }, data: { mode: body.mode } });
    }
    await syncPhotoSources(jobId);
    return NextResponse.json({ ok: true });
  });
}
