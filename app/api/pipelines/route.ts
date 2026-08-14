import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { processingConfigured, registerPipeline } from "@/lib/processing";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import Busboy from "busboy";

export const runtime = "nodejs";
export const maxDuration = 300;

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const MAX_UPLOAD_BYTES = Number(process.env.PIPELINE_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024 * 1024); // 2 GB default, covers model weights

const SAMPLE_TYPE = "pipeline-datasets";
const SCRIPT_TYPE = "pipeline-scripts";
const MODEL_TYPE = "pipeline-models";

const ALLOWED_MATCH_TABLES = [
  "photos", "notes", "recordings", "locations", "lab-member-uploads", "test-data-rows", "documents",
] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pipelines = await prisma.pipeline.findMany({
    include: {
      Creator: { select: { id: true, name: true, email: true } },
      _count: { select: { Runs: true } },
    },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(pipelines);
}

function sanitizedName(original: string) {
  return `${Date.now()}_${original.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Pipelines run arbitrary uploaded code automatically against real data with no
  // approval gate — restrict creation to admins rather than the usual canCreate (member+).
  if (!isAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Only admins can create pipelines" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "No request body" }, { status: 400 });
  }

  const sampleDir = path.join(DATA_DIR, SAMPLE_TYPE);
  const scriptDir = path.join(DATA_DIR, SCRIPT_TYPE);
  const modelDir = path.join(DATA_DIR, MODEL_TYPE);
  fs.mkdirSync(sampleDir, { recursive: true });
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });

  type FileMeta = { filename: string; originalName: string } | null;
  const written: string[] = []; // absolute paths, for cleanup on failure

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
        if (!dir) {
          fileStream.resume(); // drain unknown field
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

      bb.on("field", (name, value) => {
        fields[name] = value;
      });

      bb.on("finish", async () => {
        try {
          await Promise.all(filePromises);
          resolve({ fields, sample, script, model });
        } catch (err) {
          reject(err);
        }
      });

      bb.on("error", reject);

      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
    });
  } catch (err) {
    for (const f of written) { try { fs.unlinkSync(f); } catch {} }
    console.error("[api/pipelines] upload parse failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { fields, sample, script, model } = parsed;
  const name = fields.name?.trim();
  const isDroneFlightTarget = fields.target_kind === "drone_flight";
  const match_table = fields.match_table || null;

  if (!name || !sample || !script) {
    for (const f of written) { try { fs.unlinkSync(f); } catch {} }
    return NextResponse.json(
      { error: "name, sample_dataset, and script are required" },
      { status: 400 }
    );
  }
  // Drone-flight pipelines are always run manually against a chosen flight record —
  // they have no upload to match against, so match_table doesn't apply. Every other
  // pipeline still needs a valid match_table to be auto-triggered by lib/pipeline-match.ts.
  if (!isDroneFlightTarget && !ALLOWED_MATCH_TABLES.includes(match_table as (typeof ALLOWED_MATCH_TABLES)[number])) {
    for (const f of written) { try { fs.unlinkSync(f); } catch {} }
    return NextResponse.json({ error: "match_table is required unless target_kind is drone_flight" }, { status: 400 });
  }

  const pipeline = await prisma.pipeline.create({
    data: {
      name,
      description: fields.description || null,
      status: "draft",
      target_kind: isDroneFlightTarget ? "drone_flight" : null,
      match_table: isDroneFlightTarget ? null : match_table,
      match_category: isDroneFlightTarget ? null : (fields.match_category || null),
      match_project_id: isDroneFlightTarget ? null : (fields.match_project_id ? Number(fields.match_project_id) : null),
      match_test_id: isDroneFlightTarget ? null : (fields.match_test_id ? Number(fields.match_test_id) : null),
      sample_dataset_filename: sample.filename,
      sample_dataset_original_name: sample.originalName,
      script_filename: script.filename,
      script_original_name: script.originalName,
      model_filename: model?.filename ?? null,
      model_original_name: model?.originalName ?? null,
      created_by: session.user.id,
    },
  });

  if (!processingConfigured) {
    return NextResponse.json({ ...pipeline, processing_configured: false }, { status: 201 });
  }

  try {
    const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
    const { external_pipeline_id } = await registerPipeline({
      pipeline_id: pipeline.id,
      name: pipeline.name,
      match_table: pipeline.match_table,
      sample_dataset_url: `${baseUrl}/api/files/${SAMPLE_TYPE}/${sample.filename}`,
      script_url: `${baseUrl}/api/files/${SCRIPT_TYPE}/${script.filename}`,
      model_url: model ? `${baseUrl}/api/files/${MODEL_TYPE}/${model.filename}` : null,
      callback_url: `${baseUrl}/api/pipelines/webhook`,
    });

    const updated = await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { status: "testing", external_pipeline_id },
    });

    return NextResponse.json({ ...updated, processing_configured: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({
      ...pipeline,
      processing_configured: true,
      warning: `Pipeline saved locally but registration with the processing machine failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 201 });
  }
}
