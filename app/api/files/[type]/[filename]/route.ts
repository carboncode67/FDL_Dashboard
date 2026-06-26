import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const ALLOWED_TYPES = ["photos", "recordings", "locations", "documents", "depth_maps"] as const;

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
  ogg: "audio/ogg", webm: "audio/webm", mp4: "video/mp4",
  pdf: "application/pdf", json: "application/json",
};

async function isAuthorized(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7);
    const contact = await prisma.contact.findFirst({ where: { token }, select: { id: true } });
    if (contact) return true;
    const labMember = await prisma.user.findFirst({ where: { bearer_token: token }, select: { id: true } });
    if (labMember) return true;
    return false;
  }

  const session = await auth();
  return !!session?.user;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string; filename: string }> }
) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, filename } = await params;

  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const safe = path.basename(filename);
  if (!safe || safe !== filename) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(DATA_DIR, type, safe);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = safe.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const stat = fs.statSync(filePath);
  const total = stat.size;

  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      const chunkSize = end - start + 1;
      const buffer = Buffer.alloc(chunkSize);
      const fd = fs.openSync(filePath, "r");
      fs.readSync(fd, buffer, 0, chunkSize, start);
      fs.closeSync(fd);
      return new NextResponse(buffer, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": "inline",
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(chunkSize),
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
    },
  });
}
