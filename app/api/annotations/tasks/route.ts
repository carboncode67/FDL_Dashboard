import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import {
  cvatConfigured,
  createCvatProject,
  createCvatTask,
  addUrlsToTask,
  cvatTaskUrl,
  type CvatLabel,
} from "@/lib/cvat";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");

  const tasks = await prisma.cvatTask.findMany({
    where: projectId ? { project_id: parseInt(projectId) } : {},
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    project_id: number;
    name: string;
    label_set?: CvatLabel[];
  };
  const { project_id, name, label_set = [] } = body;

  if (!project_id || !name) {
    return NextResponse.json({ error: "project_id and name are required" }, { status: 400 });
  }

  // Gather annotatable images for this project (status >= 2 = farm assigned)
  const [photos, labUploads] = await Promise.all([
    prisma.photo.findMany({
      where: { project_id, status: { gte: 2 }, filename: { gt: "" } },
      select: { id: true, filename: true },
    }),
    prisma.labMemberUpload.findMany({
      where: { project_id, media_type: "photo", status: { gte: 2 }, filename: { gt: "" } },
      select: { id: true, filename: true },
    }),
  ]);

  const task = await prisma.cvatTask.create({
    data: { project_id, name, label_set: label_set as object[], status: "pending", image_count: photos.length + labUploads.length },
  });

  if (!cvatConfigured) {
    return NextResponse.json({ ...task, cvat_configured: false }, { status: 201 });
  }

  try {
    const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
    const imageUrls = [
      ...photos.map((p) => `${baseUrl}/api/files/photos/${p.filename}`),
      ...labUploads.map((u) => `${baseUrl}/api/files/photos/${u.filename}`),
    ];

    const cvatProj = await createCvatProject(name, label_set);
    const cvatTask = await createCvatTask(cvatProj.id, name, label_set);
    if (imageUrls.length > 0) await addUrlsToTask(cvatTask.id, imageUrls);

    const updated = await prisma.cvatTask.update({
      where: { id: task.id },
      data: { cvat_task_id: cvatTask.id, cvat_project_id: cvatProj.id, status: "in_progress" },
    });

    return NextResponse.json({
      ...updated,
      cvat_configured: true,
      cvat_url: cvatTaskUrl(cvatTask.id),
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({
      ...task,
      cvat_configured: true,
      warning: `Task saved locally but CVAT sync failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 201 });
  }
}
