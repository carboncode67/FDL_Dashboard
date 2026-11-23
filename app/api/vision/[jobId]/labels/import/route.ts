import { NextResponse } from "next/server";
import { withVisionJob } from "@/lib/vision-route";
import { importLabelFile, previewLabelFile, type LabelFile } from "@/lib/vision";

// Training labels from a file, onto one ortho source. multipart:
//   file          one label file (CSV / GeoJSON / zipped shapefile / GPKG / KML / KMZ),
//                 or a loose .shp plus its .dbf/.prj/.cpg as several `file` parts
//   source_id     the ortho's Vision_Sources id
//   epsg          optional; the file's CRS when it doesn't say (CSV, GPKG without EPSG, .shp without .prj)
//   mode          "preview" → columns + value counts, nothing written; else import:
//   class_column  label column; background_value = the value meaning background
//                 (present but empty = empty cells are background), every other value is its own class
//   default_class_id  instead of class_column: one class for the whole file
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return withVisionJob(jobId, { edit: true }, async ({ session, jobId }) => {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Files too large (25 MB max)" }, { status: 413 });
    }
    const form = await req.formData();
    const parts = form.getAll("file").filter((f): f is File => f instanceof File);
    if (parts.length === 0) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (parts.length > 6) return NextResponse.json({ error: "Too many files" }, { status: 400 });
    if (parts.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return NextResponse.json({ error: "Files too large (25 MB max)" }, { status: 413 });
    const files: LabelFile[] = await Promise.all(parts.map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })));

    const epsgRaw = String(form.get("epsg") ?? "").trim();
    const epsg = epsgRaw ? Number(epsgRaw) : null;
    if (epsg != null && !(Number.isInteger(epsg) && epsg > 0)) return NextResponse.json({ error: "Invalid EPSG code" }, { status: 400 });
    const sourceId = Number(form.get("source_id"));

    if (form.get("mode") === "preview") {
      return NextResponse.json(await previewLabelFile(jobId, { sourceId, files, epsg }));
    }
    const defaultClass = Number(form.get("default_class_id"));
    const bg = form.get("background_value");
    const result = await importLabelFile(jobId, {
      sourceId, files, epsg,
      classColumn: (form.get("class_column") as string | null)?.trim() || null,
      backgroundValue: typeof bg === "string" ? bg : null,
      defaultClassId: Number.isInteger(defaultClass) && defaultClass > 0 ? defaultClass : null,
      userId: session.user.id ?? null,
    });
    return NextResponse.json(result, { status: 201 });
  });
}
