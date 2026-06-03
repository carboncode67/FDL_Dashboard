export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.content !== "string") {
    return NextResponse.json({ error: "content (string) is required" }, { status: 400 });
  }

  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
  if (!farm) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

  await prisma.farm.update({ where: { id: farmId }, data: { farm_summary: body.content } });
  return NextResponse.json({ ok: true });
}
