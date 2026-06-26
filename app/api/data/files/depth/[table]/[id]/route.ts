import { NextResponse } from "next/server";
import { authenticateUpload } from "@/lib/upload-auth";
import { DATA_DIR } from "@/lib/data-api";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const ALLOWED_TABLES = ["photos", "lab-member-uploads"] as const;
type DepthTable = (typeof ALLOWED_TABLES)[number];

function isDepthTable(t: string): t is DepthTable {
  return (ALLOWED_TABLES as readonly string[]).includes(t);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { table, id } = await params;
  if (!isDepthTable(table)) {
    return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let depthFilename: string | null = null;

  if (table === "photos") {
    const row = await prisma.photo.findUnique({ where: { id: numId }, select: { depth_filename: true } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    depthFilename = row.depth_filename ?? null;
  } else {
    const row = await prisma.labMemberUpload.findUnique({ where: { id: numId }, select: { depth_filename: true } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    depthFilename = row.depth_filename ?? null;
  }

  if (!depthFilename) {
    return NextResponse.json({ error: "No depth map for this record" }, { status: 404 });
  }

  const filePath = path.join(DATA_DIR, "depth_maps", path.basename(depthFilename));
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Depth map file not found on disk" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${path.basename(depthFilename)}"`,
    },
  });
}
