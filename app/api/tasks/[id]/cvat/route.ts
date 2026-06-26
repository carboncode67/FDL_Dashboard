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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const taskId = parseInt(id);

  const body = await req.json() as { label_set?: CvatLabel[] };
  const labelSet = body.label_set ?? [];

  // Load the workflow task and all its linked uploads
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { UploadLinks: true, CvatTasks: { orderBy: { created_at: "desc" }, take: 1 } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (task.UploadLinks.length === 0) {
    return NextResponse.json({ error: "No files linked to this task — link files before sending to CVAT" }, { status: 400 });
  }

  // Resolve filenames for each linked upload
  const photoIds    = task.UploadLinks.filter((l) => l.upload_table === "photos").map((l) => l.upload_id);
  const labUploadIds = task.UploadLinks.filter((l) => l.upload_table === "lab-member-uploads").map((l) => l.upload_id);

  const [photos, labUploads] = await Promise.all([
    photoIds.length
      ? prisma.photo.findMany({ where: { id: { in: photoIds } }, select: { id: true, filename: true } })
      : [],
    labUploadIds.length
      ? prisma.labMemberUpload.findMany({ where: { id: { in: labUploadIds } }, select: { id: true, filename: true } })
      : [],
  ]);

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  const imageUrls = [
    ...photos.filter((p) => p.filename).map((p) => `${baseUrl}/api/files/photos/${p.filename}`),
    ...labUploads.filter((u) => u.filename).map((u) => `${baseUrl}/api/files/photos/${u.filename}`),
  ];

  if (imageUrls.length === 0) {
    return NextResponse.json({ error: "No filenames found for linked uploads" }, { status: 400 });
  }

  // Create the CvatTask record in FDL DB
  const taskName = task.description.slice(0, 100);
  const cvatRecord = await prisma.cvatTask.create({
    data: {
      fdl_task_id: taskId,
      name: taskName,
      label_set: labelSet as object[],
      status: "pending",
      image_count: imageUrls.length,
    },
  });

  if (!cvatConfigured) {
    return NextResponse.json({
      id: cvatRecord.id,
      cvat_configured: false,
      image_count: imageUrls.length,
      message: "Task saved locally. Set CVAT_URL, CVAT_USERNAME, and CVAT_PASSWORD to enable CVAT sync.",
    }, { status: 201 });
  }

  try {
    const cvatProj = await createCvatProject(taskName, labelSet);
    const cvatTask = await createCvatTask(cvatProj.id, taskName, labelSet);
    await addUrlsToTask(cvatTask.id, imageUrls);

    const updated = await prisma.cvatTask.update({
      where: { id: cvatRecord.id },
      data: { cvat_task_id: cvatTask.id, cvat_project_id: cvatProj.id, status: "in_progress" },
    });

    return NextResponse.json({
      ...updated,
      cvat_configured: true,
      cvat_url: cvatTaskUrl(cvatTask.id),
      image_count: imageUrls.length,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({
      id: cvatRecord.id,
      cvat_configured: true,
      image_count: imageUrls.length,
      warning: `Saved locally but CVAT sync failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 201 });
  }
}
