import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const { id } = await params;
  const zone = await prisma.experimentZone.findUnique({ where: { id: parseInt(id) } });
  if (!zone) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(zone);
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const allowed = ["title", "geometry", "Boundary_Source", "Zone_Label", "Rep_Number", "farm_id", "Fields_id", "project_id"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const zone = await prisma.experimentZone.update({ where: { id: parseInt(id) }, data });
  return NextResponse.json(zone);
  });
}
