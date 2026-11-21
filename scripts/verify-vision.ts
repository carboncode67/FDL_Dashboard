/**
 * End-to-end check of lib/vision.ts (migration 103) against a LOCAL / DEV
 * database and a reachable PipelineProcessor with VISION_* configured.
 * Creates its own Task (tagged VISION-FIXTURE) and removes it at the end.
 *
 * The processor must be able to fetch NEXTAUTH_URL/api/files/basemap-sources/*
 * and NEXTAUTH_URL/api/data/files/photos/*, so for a test processor point
 * NEXTAUTH_URL at a stand-in file server on its side. The callback isn't
 * needed: the script polls the run's metrics.json and calls
 * ingestVisionResults() itself.
 *
 *   set -a; source .env.local; set +a
 *   PROCESSING_URL=http://<processor>:8011 PROCESSING_API_KEY=… NEXTAUTH_URL=http://127.0.0.1:8012 \
 *   VISION_BASEMAP_ID=4 VISION_PHOTO_ID=15 \
 *   VISION_ORTHO_LABELS=spec_ortho.json VISION_PHOTO_LABELS=spec_photo.json \
 *   TS_NODE_BASEURL=. TS_NODE_TRANSPILE_ONLY=1 npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node"}' scripts/verify-vision.ts
 *
 * The label files are worker specs ({labels: [{class_id: 0|1, geom}]}, 0 =
 * background): lon/lat points for the ortho, pixel geometry for the photo.
 */
import fs from "fs";
import { prisma } from "@/lib/prisma";
import {
  addLabels, createVisionJob, importPointLabels, ingestVisionResults, predictionsGeojson, setBasemapSources, startVisionRun,
} from "@/lib/vision";

const TAG = "VISION-FIXTURE";
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const basemapId = Number(process.env.VISION_BASEMAP_ID);
  const photoId = Number(process.env.VISION_PHOTO_ID);
  const ortho = JSON.parse(fs.readFileSync(process.env.VISION_ORTHO_LABELS!, "utf8")).labels as { class_id: number; geom: unknown }[];
  const photo = JSON.parse(fs.readFileSync(process.env.VISION_PHOTO_LABELS!, "utf8")).labels as { class_id: number; geom: unknown }[];

  const task = await prisma.task.create({ data: { description: `${TAG} weeds`, classification: "image annotation", lab_id: 1 } });
  await prisma.taskUploadLink.create({ data: { task_id: task.id, upload_id: photoId, upload_table: "photos" } });
  let layerId: number | null = null;
  try {
    const job = await createVisionJob(task.id, { classes: ["green"], userId: null });
    const classes = await prisma.visionClass.findMany({ where: { job_id: job.id } });
    const bg = classes.find((c) => c.is_background)!;
    const green = classes.find((c) => c.name === "green")!;
    check("job has background + green", classes.length === 2 && !!bg && !!green);

    const photoSrc = await prisma.visionSource.findFirst({ where: { job_id: job.id, kind: "photo" } });
    check("linked photo synced as a source", photoSrc?.upload_id === photoId);

    await setBasemapSources(job.id, [basemapId]);
    const orthoSrc = await prisma.visionSource.findFirst({ where: { job_id: job.id, kind: "basemap" } });
    check("basemap source added", orthoSrc?.basemap_id === basemapId);

    // GPS import: a GeoJSON with a class column.
    const fc = {
      type: "FeatureCollection",
      features: ortho.map((l) => ({ type: "Feature", geometry: l.geom, properties: { cls: l.class_id === 1 ? "Green" : "background" } })),
    };
    const imp = await importPointLabels(job.id, {
      sourceId: orthoSrc!.id, text: JSON.stringify(fc), filename: "points.geojson", classColumn: "cls", defaultClassId: null, userId: null,
    });
    check("GPS points imported", imp.imported === ortho.length && imp.skipped === 0, imp);

    const n = await addLabels(job.id, photo.map((l) => ({ source_id: photoSrc!.id, class_id: l.class_id === 1 ? green.id : bg.id, geom: l.geom })), null);
    check("photo labels added (points + boxes)", n === photo.length);
    const boxes = await prisma.visionLabel.count({ where: { job_id: job.id, geom_kind: "box" } });
    check("square polygons stored as boxes", boxes > 0, { boxes });

    let rejected = false;
    try {
      await addLabels(job.id, [{ source_id: orthoSrc!.id, class_id: green.id, geom: { type: "Point", coordinates: [500000, 4600000] } }], null);
    } catch {
      rejected = true;
    }
    check("projected coords rejected on a basemap source", rejected);

    const run = await startVisionRun(job.id, { head: "knn", k: 5, threshold: 0.5 }, null);
    check("run accepted by processor", run.status === "running", { status: run.status, error: run.error_message });
    if (run.status !== "running") return;

    let second = false;
    try {
      await startVisionRun(job.id, {}, null);
    } catch {
      second = true;
    }
    check("second concurrent run refused", second);

    const base = process.env.PROCESSING_URL!.replace(/\/$/, "");
    const headers = { Authorization: `Bearer ${process.env.PROCESSING_API_KEY}` };
    let metrics: Record<string, unknown> | null = null;
    for (let i = 0; i < 120 && !metrics; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const res = await fetch(`${base}/vision-run-artifacts/${run.id}/metrics.json`, { headers });
      if (res.ok) metrics = await res.json();
    }
    check("processor finished", metrics != null, metrics);
    if (!metrics) return;

    const action = await ingestVisionResults({
      event: "vision_completed", vision_run_id: run.id, model: "test", metrics,
      sources: {}, predictions_url: `${base}/vision-run-artifacts/${run.id}/predictions.json`,
    });
    const after = await prisma.visionRun.findUniqueOrThrow({ where: { id: run.id } });
    layerId = after.layer_id;
    check("ingested", action === "ingested" && after.status === "ready", { action, status: after.status });
    check("predictions stored", (after.prediction_count ?? 0) > 0, { count: after.prediction_count });
    const bySource = await prisma.visionPrediction.groupBy({ by: ["source_id"], where: { run_id: run.id }, _count: true });
    check("predictions on both photo and ortho", bySource.length === 2, bySource);
    const layer = layerId ? await prisma.farmLayer.findUnique({ where: { id: layerId } }) : null;
    check("farm layer written for the ortho", (layer?.feature_count ?? 0) > 0, { name: layer?.name, features: layer?.feature_count });
    const gj = await predictionsGeojson(run.id, photoSrc!.id);
    check("photo GeoJSON in pixel space", gj.features.length > 0 && gj.features.every((f) => f.properties.space === "pixel"));
    check("job moved to review", (await prisma.visionJob.findUniqueOrThrow({ where: { id: job.id } })).status === "review");
    check("re-ingest is a no-op", (await ingestVisionResults({ event: "vision_completed", vision_run_id: run.id, predictions_url: "x" })) === "already_ingested");
  } finally {
    await prisma.task.delete({ where: { id: task.id } });
    if (layerId) await prisma.farmLayer.deleteMany({ where: { id: layerId } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
    process.exit(failures ? 1 : 0);
  });
