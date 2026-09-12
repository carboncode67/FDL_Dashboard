import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const { searchParams } = new URL(req.url);
  const farmId = searchParams.get("farm_id");

  const where = farmId ? { Farms_id: parseInt(farmId) } : {};
  const fields = await prisma.field.findMany({
    where,
    select: { id: true, Name: true, geometry: true, boundary_source: true, Farms_id: true },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(fields);
  });
}

export async function POST(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { Name, Farms_id, geometry, boundary_source } = body;
  if (!Farms_id) return NextResponse.json({ error: "Farms_id is required" }, { status: 400 });

  const field = await prisma.field.create({
    data: { Name, Farms_id, geometry, boundary_source },
  });

  return NextResponse.json(field, { status: 201 });
  });
}
