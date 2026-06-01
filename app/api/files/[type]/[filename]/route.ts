import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const ALLOWED_TYPES = ["photos", "recordings", "locations"] as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; filename: string }> }
) {
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

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Content-Type": "application/octet-stream",
    },
  });
}
