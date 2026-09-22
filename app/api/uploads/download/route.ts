import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { DATA_DIR } from "@/lib/data-api";

export const runtime = "nodejs";

const ALLOWED = ["photos", "notes", "recordings", "locations", "lab-member-uploads", "documents", "videos"] as const;
type Table = (typeof ALLOWED)[number];

function isAllowed(t: string): t is Table {
  return (ALLOWED as readonly string[]).includes(t);
}

type ResolvedFile =
  | { kind: "file"; path: string; name: string }
  | { kind: "text"; content: string; name: string }
  | { kind: "missing" };

// Mirrors the per-table dispatch in app/api/data/files/[table]/[id]/route.ts,
// plus a "videos" case that route doesn't have.
async function resolveFile(table: Table, id: number): Promise<ResolvedFile> {
  switch (table) {
    case "photos": {
      const row = await prisma.photo.findUnique({ where: { id } });
      if (!row) return { kind: "missing" };
      return { kind: "file", path: path.join(DATA_DIR, "photos", path.basename(row.filename)), name: row.filename };
    }
    case "recordings": {
      const row = await prisma.recording.findUnique({ where: { id } });
      if (!row) return { kind: "missing" };
      return { kind: "file", path: path.join(DATA_DIR, "recordings", path.basename(row.filename)), name: row.filename };
    }
    case "locations": {
      const row = await prisma.location.findUnique({ where: { id } });
      if (!row?.track_filename) return { kind: "missing" };
      return {
        kind: "file",
        path: path.join(DATA_DIR, "locations", path.basename(row.track_filename)),
        name: row.track_filename,
      };
    }
    case "notes": {
      const row = await prisma.note.findUnique({ where: { id } });
      if (!row) return { kind: "missing" };
      return { kind: "text", content: row.content, name: `note_${row.id}.txt` };
    }
    case "lab-member-uploads": {
      const row = await prisma.labMemberUpload.findUnique({ where: { id } });
      if (!row) return { kind: "missing" };
      if (row.media_type === "note") {
        return { kind: "text", content: row.content ?? "", name: `note_${row.id}.txt` };
      }
      if (!row.filename) return { kind: "missing" };
      const dir = row.media_type === "photo" ? "photos" : row.media_type === "recording" ? "recordings" : "locations";
      return { kind: "file", path: path.join(DATA_DIR, dir, path.basename(row.filename)), name: row.filename };
    }
    case "documents": {
      const row = await prisma.document.findUnique({ where: { id } });
      if (!row?.filename) return { kind: "missing" };
      return { kind: "file", path: path.join(DATA_DIR, "documents", path.basename(row.filename)), name: row.filename };
    }
    case "videos": {
      const row = await prisma.video.findUnique({ where: { id } });
      if (!row) return { kind: "missing" };
      return { kind: "file", path: path.join(DATA_DIR, "videos", path.basename(row.filename)), name: row.filename };
    }
  }
}

export async function POST(req: Request) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const items: { table: string; id: number }[] = body.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items requested" }, { status: 400 });
    }
    for (const item of items) {
      if (!isAllowed(item.table)) {
        return NextResponse.json({ error: `Unknown table: ${item.table}` }, { status: 400 });
      }
    }

    const resolved = await Promise.all(items.map((item) => resolveFile(item.table as Table, item.id)));

    // Single item: stream the file (or text) directly, no zip.
    if (resolved.length === 1) {
      const entry = resolved[0];
      const safeName = entry.kind === "missing" ? "" : path.basename(entry.name);
      if (entry.kind === "missing") {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      if (entry.kind === "text") {
        return new NextResponse(entry.content, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeName}"`,
          },
        });
      }
      if (!fs.existsSync(entry.path)) {
        return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
      }
      const stat = fs.statSync(entry.path);
      const nodeStream = fs.createReadStream(entry.path);
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return new NextResponse(webStream, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeName}"`,
          "Content-Length": String(stat.size),
        },
      });
    }

    // Multiple items: stream a zip, grouped by table to avoid filename collisions.
    // Items missing from the DB or disk are silently excluded from the archive
    // (can't fail the whole request for one bad row) — instead their count is
    // reported back via a header so the client can warn the user rather than
    // hand them a zip that's quietly short a few files.
    const archive = new ZipArchive({ zlib: { level: 9 } });
    let skipped = 0;
    for (let i = 0; i < items.length; i++) {
      const entry = resolved[i];
      const { table, id } = items[i];
      if (entry.kind === "missing") {
        skipped++;
        continue;
      }
      if (entry.kind === "text") {
        archive.append(entry.content, { name: `${table}/${path.basename(entry.name)}` });
      } else if (fs.existsSync(entry.path)) {
        archive.file(entry.path, { name: `${table}/${id}_${path.basename(entry.name)}` });
      } else {
        skipped++;
      }
    }
    archive.finalize();
    const webStream = Readable.toWeb(archive as unknown as Readable) as unknown as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="incoming-data-${Date.now()}.zip"`,
        "X-Download-Skipped-Count": String(skipped),
      },
    });
  });
}
