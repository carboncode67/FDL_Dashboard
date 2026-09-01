import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { processingConfigured, registerPipeline, type PipelineDataContext } from "@/lib/processing";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import Busboy from "busboy";

export const runtime = "nodejs";
export const maxDuration = 300;

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const MAX_UPLOAD_BYTES = Number(process.env.PIPELINE_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024 * 1024);

const SAMPLE_TYPE = "pipeline-datasets";
const SCRIPT_TYPE = "pipeline-scripts";
const MODEL_TYPE = "pipeline-models";
const DATA_TABLE_SAMPLE_TYPE = "data-table-samples";
const SAMPLE_PREVIEW_MAX_CHARS = 4000;

const ALLOWED_MATCH_TABLES = [
  "photos", "notes", "recordings", "locations", "lab-member-uploads", "test-data-rows", "documents",
] as const;

function sanitizedName(original: string) {
  return `${Date.now()}_${original.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

// Edits a pipeline's metadata and/or swaps its sample dataset / script / model,
// then ALWAYS re-registers with the processing machine — this is the only way
// to recover a pipeline stuck at status "failed" (e.g. a script bug), since the
// ordinary PATCH route only flips a few scoping fields and the run/rerun routes
// only ever produce PipelineRun rows — neither one can move Pipeline.status back
// to "live", which only happens on a fresh "pipeline_registered" webhook event.
// Any field/file not included in the request keeps its current stored value.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Only admins can edit pipelines" }, { status: 403 });
  }

  const { id } = await params;
  const pipelineId = parseInt(id);
  if (isNaN(pipelineId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const existing = await prisma.pipeline.findUnique({ where: { id: pipelineId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  if (!request.body) return NextResponse.json({ error: "No request body" }, { status: 400 });

  const sampleDir = path.join(DATA_DIR, SAMPLE_TYPE);
  const scriptDir = path.join(DATA_DIR, SCRIPT_TYPE);
  const modelDir = path.join(DATA_DIR, MODEL_TYPE);
  fs.mkdirSync(sampleDir, { recursive: true });
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });

  type FileMeta = { filename: string; originalName: string } | null;
  const written: string[] = [];

  let parsed: { fields: Record<string, string>; sample: FileMeta; script: FileMeta; model: FileMeta };
  try {
    parsed = await new Promise((resolve, reject) => {
      const bb = Busboy({
        headers: { "content-type": contentType },
        limits: { fileSize: MAX_UPLOAD_BYTES, fieldSize: 1024 * 1024 },
      });

      const fields: Record<string, string> = {};
      let sample: FileMeta = null;
      let script: FileMeta = null;
      let model: FileMeta = null;
      const filePromises: Promise<void>[] = [];

      bb.on("file", (fieldname, fileStream, info) => {
        const dir = fieldname === "sample_dataset" ? sampleDir : fieldname === "script" ? scriptDir : fieldname === "model" ? modelDir : null;
        if (!dir || !info.filename) {
          fileStream.resume();
          return;
        }
        const filename = sanitizedName(info.filename);
        const dest = path.join(dir, filename);
        written.push(dest);
        const writeStream = fs.createWriteStream(dest);
        fileStream.pipe(writeStream);
        filePromises.push(
          new Promise<void>((res, rej) => {
            writeStream.on("finish", res);
            writeStream.on("error", rej);
            fileStream.on("error", rej);
          })
        );
        const meta = { filename, originalName: info.filename };
        if (fieldname === "sample_dataset") sample = meta;
        else if (fieldname === "script") script = meta;
        else if (fieldname === "model") model = meta;
      });

      bb.on("field", (name, value) => { fields[name] = value; });

      bb.on("finish", async () => {
        try { await Promise.all(filePromises); resolve({ fields, sample, script, model }); }
        catch (err) { reject(err); }
      });

      bb.on("error", reject);
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
    });
  } catch (err) {
    for (const f of written) { try { fs.unlinkSync(f); } catch {} }
    console.error("[api/pipelines/[id]/edit] upload parse failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { fields, sample, script, model } = parsed;
  const name = fields.name?.trim() || existing.name;
  const isDroneFlightTarget = existing.target_kind === "drone_flight"; // fixed at creation, not editable
  const match_table = isDroneFlightTarget ? null : (fields.match_table || existing.match_table);

  if (!isDroneFlightTarget && !ALLOWED_MATCH_TABLES.includes(match_table as (typeof ALLOWED_MATCH_TABLES)[number])) {
    for (const f of written) { try { fs.unlinkSync(f); } catch {} }
    return NextResponse.json({ error: "match_table is required unless target_kind is drone_flight" }, { status: 400 });
  }
  const match_data_table_id = fields.match_data_table_id
    ? Number(fields.match_data_table_id)
    : (fields.match_data_table_id === "" ? null : existing.match_data_table_id);
  if (!isDroneFlightTarget && match_table === "test-data-rows" && !match_data_table_id) {
    for (const f of written) { try { fs.unlinkSync(f); } catch {} }
    return NextResponse.json({ error: "A Sample Data Upload trigger requires a Data Table" }, { status: 400 });
  }

  // Delete the old stored file only once its replacement has finished writing above.
  if (sample) { try { fs.unlinkSync(path.join(sampleDir, existing.sample_dataset_filename)); } catch {} }
  if (script) { try { fs.unlinkSync(path.join(scriptDir, existing.script_filename)); } catch {} }
  if (model && existing.model_filename) { try { fs.unlinkSync(path.join(modelDir, existing.model_filename)); } catch {} }

  const pipeline = await prisma.pipeline.update({
    where: { id: pipelineId },
    data: {
      name,
      description: "description" in fields ? (fields.description || null) : existing.description,
      match_table: isDroneFlightTarget ? null : match_table,
      match_category: isDroneFlightTarget ? null : ("match_category" in fields ? (fields.match_category || null) : existing.match_category),
      match_project_id: isDroneFlightTarget ? null : (fields.match_project_id ? Number(fields.match_project_id) : ("match_project_id" in fields ? null : existing.match_project_id)),
      match_data_table_id: isDroneFlightTarget ? null : match_data_table_id,
      use_spatial_context: isDroneFlightTarget ? false : ("use_spatial_context" in fields ? fields.use_spatial_context === "on" : existing.use_spatial_context),
      sample_dataset_filename: sample?.filename ?? existing.sample_dataset_filename,
      sample_dataset_original_name: sample?.originalName ?? existing.sample_dataset_original_name,
      script_filename: script?.filename ?? existing.script_filename,
      script_original_name: script?.originalName ?? existing.script_original_name,
      model_filename: model?.filename ?? existing.model_filename,
      model_original_name: model?.originalName ?? existing.model_original_name,
      status: "draft",
    },
  });

  if (!processingConfigured) {
    return NextResponse.json({ ...pipeline, processing_configured: false }, { status: 200 });
  }

  try {
    const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");

    const matchedTable = pipeline.match_data_table_id
      ? await prisma.dataTable.findUnique({
          where: { id: pipeline.match_data_table_id },
          include: { FieldDefinitions: { orderBy: { col_index: "asc" } } },
        })
      : null;
    let samplePreview: string | null = null;
    if (matchedTable?.sample_filename) {
      try {
        const raw = fs.readFileSync(
          path.join(DATA_DIR, DATA_TABLE_SAMPLE_TYPE, matchedTable.sample_filename),
          "utf-8"
        );
        samplePreview = raw.length > SAMPLE_PREVIEW_MAX_CHARS
          ? raw.slice(0, SAMPLE_PREVIEW_MAX_CHARS) + "\n… (truncated)"
          : raw;
      } catch {
        // sample file missing on disk — proceed without it
      }
    }

    const dataContext: PipelineDataContext | null =
      pipeline.description || matchedTable
        ? {
            pipeline_description: pipeline.description,
            data_table: matchedTable
              ? {
                  name: matchedTable.name,
                  description: matchedTable.description,
                  data_processing_instructions: matchedTable.data_processing_instructions,
                  columns: matchedTable.FieldDefinitions.map((d) => ({
                    label: d.label,
                    field_type: d.field_type,
                  })),
                  sample_preview: samplePreview,
                }
              : null,
          }
        : null;

    const { external_pipeline_id } = await registerPipeline({
      pipeline_id: pipeline.id,
      name: pipeline.name,
      match_table: pipeline.match_table,
      sample_dataset_url: `${baseUrl}/api/files/${SAMPLE_TYPE}/${pipeline.sample_dataset_filename}`,
      script_url: `${baseUrl}/api/files/${SCRIPT_TYPE}/${pipeline.script_filename}`,
      model_url: pipeline.model_filename ? `${baseUrl}/api/files/${MODEL_TYPE}/${pipeline.model_filename}` : null,
      callback_url: `${baseUrl}/api/pipelines/webhook`,
      use_spatial_context: pipeline.use_spatial_context,
      data_context: dataContext,
    });

    const updated = await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { status: "testing", external_pipeline_id },
    });

    return NextResponse.json({ ...updated, processing_configured: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({
      ...pipeline,
      processing_configured: true,
      warning: `Saved, but re-registration with the processing machine failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 200 });
  }
}
