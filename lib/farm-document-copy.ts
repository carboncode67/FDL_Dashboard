import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { matchDocumentToTemplate } from "@/lib/document-template-match";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

// Unified farm upload box: a spatial file the uploader chose to display on the
// map is also kept as an ordinary farm Document (same DATA_DIR/documents/ file +
// Documents row + template match + pipeline trigger as
// app/api/farms/[id]/documents), so the original stays downloadable from the
// Documents tab.
//
// Pass `buffer` for a small upload already in memory (vector/CSV), or
// `sourcePath` for a file already on disk under DATA_DIR (a multi-GB basemap
// source) — that one is hard-linked rather than copied so keeping the original
// costs no extra space, falling back to a copy if the link fails (e.g. a
// DATA_DIR split across filesystems).
export async function keepAsFarmDocument(opts: {
  farmId: number;
  originalName: string;
  description?: string | null;
  buffer?: Buffer;
  sourcePath?: string;
}): Promise<number> {
  const dir = path.join(DATA_DIR, "documents");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}_${opts.originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dest = path.join(dir, filename);

  if (opts.buffer) {
    fs.writeFileSync(dest, opts.buffer);
  } else if (opts.sourcePath) {
    try {
      fs.linkSync(opts.sourcePath, dest);
    } catch {
      fs.copyFileSync(opts.sourcePath, dest);
    }
  } else {
    throw new Error("keepAsFarmDocument needs buffer or sourcePath");
  }

  const ext = path.extname(opts.originalName).toLowerCase();
  const match = opts.buffer ? await matchDocumentToTemplate(opts.buffer, ext) : null;

  const doc = await prisma.document.create({
    data: {
      farm_id: opts.farmId,
      filename,
      original_name: opts.originalName,
      file_type: ext ? ext.slice(1) : "",
      file_size: fs.statSync(dest).size,
      description: opts.description?.trim() || null,
      data_table_id: match?.dataTableId ?? null,
      test_id: match?.testId ?? null,
      drone_id: match?.droneId ?? null,
    },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  matchAndTriggerPipelines({
    table: "documents",
    id: doc.id,
    category: doc.category ?? null,
    project_id: doc.project_id ?? null,
    data_table_id: doc.data_table_id ?? null,
    inputFileUrl: `${baseUrl}/api/data/files/documents/${doc.id}`,
  }).catch((err) => console.error("[keepAsFarmDocument] pipeline trigger failed", err));

  return doc.id;
}
