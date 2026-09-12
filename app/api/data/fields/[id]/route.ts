import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const { id } = await params;
  const field = await prisma.field.findUnique({ where: { id: parseInt(id) } });
  if (!field) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(field);
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { Name, geometry, boundary_source } = body;
  const data: Record<string, unknown> = {};
  if (Name !== undefined) data.Name = Name;
  if (geometry !== undefined) data.geometry = geometry;
  if (boundary_source !== undefined) data.boundary_source = boundary_source;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const field = await prisma.field.update({ where: { id: parseInt(id) }, data });
  return NextResponse.json(field);
  });
}
