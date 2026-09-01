import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: parseInt(id) },
    include: {
      Creator: { select: { id: true, name: true, email: true } },
      Runs: { orderBy: { created_at: "desc" } },
    },
  });
  if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(pipeline);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Only admins can modify pipelines" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as {
    status?: string;
    match_category?: string | null;
    match_project_id?: number | null;
    match_data_table_id?: number | null;
  };

  const data: Record<string, unknown> = {};
  if ("status" in body) {
    if (!["draft", "testing", "live", "failed", "disabled"].includes(body.status ?? "")) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if ("match_category" in body) data.match_category = body.match_category || null;
  if ("match_project_id" in body) data.match_project_id = body.match_project_id ?? null;
  if ("match_data_table_id" in body) data.match_data_table_id = body.match_data_table_id ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const pipeline = await prisma.pipeline.update({ where: { id: parseInt(id) }, data });
  return NextResponse.json(pipeline);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Only admins can delete pipelines" }, { status: 403 });
  }

  const { id } = await params;
  const pipeline = await prisma.pipeline.findUnique({ where: { id: parseInt(id) } });
  if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.pipeline.delete({ where: { id: pipeline.id } }); // Runs cascade

  for (const [dir, filename] of [
    ["pipeline-datasets", pipeline.sample_dataset_filename],
    ["pipeline-scripts", pipeline.script_filename],
    ["pipeline-models", pipeline.model_filename],
  ] as const) {
    if (!filename) continue;
    try { fs.unlinkSync(path.join(DATA_DIR, dir, filename)); } catch {}
  }

  return NextResponse.json({ ok: true });
}
