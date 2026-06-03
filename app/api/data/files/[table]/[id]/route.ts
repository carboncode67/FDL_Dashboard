import { NextResponse } from "next/server";
import { authenticateUpload } from "@/lib/upload-auth";
import { isUploadTable, DATA_DIR } from "@/lib/data-api";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function serveFile(filePath: string, name: string): NextResponse {
  const safe = path.basename(name);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}"`,
    },
  });
}

function serveText(content: string, name: string): NextResponse {
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { table, id } = await params;
  if (!isUploadTable(table)) return NextResponse.json({ error: "Unknown table" }, { status: 400 });

  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  switch (table) {
    case "photos": {
      const row = await prisma.photo.findUnique({ where: { id: numId } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return serveFile(path.join(DATA_DIR, "photos", path.basename(row.filename)), row.filename);
    }

    case "recordings": {
      const row = await prisma.recording.findUnique({ where: { id: numId } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return serveFile(path.join(DATA_DIR, "recordings", path.basename(row.filename)), row.filename);
    }

    case "locations": {
      const row = await prisma.location.findUnique({ where: { id: numId } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!row.track_filename) return NextResponse.json({ error: "No file" }, { status: 404 });
      return serveFile(
        path.join(DATA_DIR, "locations", path.basename(row.track_filename)),
        row.track_filename
      );
    }

    case "notes": {
      const row = await prisma.note.findUnique({ where: { id: numId } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return serveText(row.content, `note_${row.id}.txt`);
    }

    case "lab-member-uploads": {
      const row = await prisma.labMemberUpload.findUnique({ where: { id: numId } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (row.media_type === "note") {
        return serveText(row.content ?? "", `note_${row.id}.txt`);
      }
      if (!row.filename) return NextResponse.json({ error: "No file" }, { status: 404 });
      const dir =
        row.media_type === "photo"
          ? "photos"
          : row.media_type === "recording"
          ? "recordings"
          : "locations";
      return serveFile(path.join(DATA_DIR, dir, path.basename(row.filename)), row.filename);
    }
  }
}
