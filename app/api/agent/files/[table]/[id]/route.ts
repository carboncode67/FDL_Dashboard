import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { getAgentRow } from "@/lib/agent/registry";
import { DATA_DIR } from "@/lib/data-api";

export const runtime = "nodejs";

// The broker re-encodes images before any model sees them (plan §6); this
// cap just keeps one request from pulling a multi-GB file.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Audio and video are deliberately absent: agents read recordings only
// through their transcripts.
const DIR_BY_TABLE: Record<string, { dir: string; column: string }> = {
  photos: { dir: "photos", column: "filename" },
  locations: { dir: "locations", column: "track_filename" },
  documents: { dir: "documents", column: "filename" },
};
const LAB_MEMBER_DIR: Record<string, string> = { photo: "photos", location: "locations", document: "documents" };

function text(content: string): NextResponse {
  return new NextResponse(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function file(dir: string, name: unknown): NextResponse {
  if (typeof name !== "string" || !name) return NextResponse.json({ error: "No file" }, { status: 404 });
  const filePath = path.join(DATA_DIR, dir, path.basename(name));
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  const { size } = fs.statSync(filePath);
  if (size > MAX_FILE_BYTES) return NextResponse.json({ error: `File is larger than ${MAX_FILE_BYTES} bytes` }, { status: 413 });
  return new NextResponse(fs.readFileSync(filePath), {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(size) },
  });
}

// GET /api/agent/files/:table/:id — the content of one upload in the token's
// lab: photo / document / GPS track bytes, or note text.
export async function GET(req: Request, { params }: { params: Promise<{ table: string; id: string }> }) {
  return withAgent(req, "files", async (agent) => {
    const { table, id } = await params;
    const numId = Number.parseInt(id, 10);
    if (Number.isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    if (table !== "notes" && table !== "lab_member_uploads" && !DIR_BY_TABLE[table]) {
      return NextResponse.json({ error: "No readable file content for this table" }, { status: 400 });
    }

    const row = await getAgentRow(table, agent.labId, numId, agent.kind);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (table === "notes") return text(String(row.content ?? ""));
    if (table === "lab_member_uploads") {
      if (row.media_type === "note") return text(String(row.content ?? ""));
      const dir = LAB_MEMBER_DIR[String(row.media_type)];
      if (!dir) return NextResponse.json({ error: "No readable file content for this media type" }, { status: 400 });
      return file(dir, row.filename);
    }
    const { dir, column } = DIR_BY_TABLE[table];
    return file(dir, row[column]);
  });
}
