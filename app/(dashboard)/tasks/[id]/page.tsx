import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { TaskDetailClient } from "./task-detail-client";
import { runWithTenant } from "@/lib/lab-db";
import { processingConfigured } from "@/lib/processing";
import { getEffectiveScope } from "@/lib/get-user-filters";
import type { VisionPanelData } from "@/components/vision-panel";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const taskId = parseInt(id);

  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;

  const [task, experiments, users, photos, labUploads, projects] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      include: {
        Experiment: { select: { id: true, experiment_name: true, Farm: { select: { Farm_Name: true } } } },
        Assignees:  { include: { User: { select: { id: true, name: true, email: true } } } },
        UploadLinks: true,
      },
    }),
    prisma.farmExperiment.findMany({
      select: { id: true, experiment_name: true, Farm: { select: { Farm_Name: true } } },
      orderBy: { experiment_name: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    // Photos for upload picker
    prisma.photo.findMany({
      where: { status: { gte: 2 } },
      select: { id: true, filename: true, category: true, received_at: true,
        Farm: { select: { Farm_Name: true } }, Project: { select: { id: true, Project_Name: true } } },
      orderBy: { received_at: "desc" },
    }),
    prisma.labMemberUpload.findMany({
      where: { status: { gte: 2 }, media_type: "photo" },
      select: { id: true, filename: true, category: true, received_at: true,
        Farm: { select: { Farm_Name: true } }, Project: { select: { id: true, Project_Name: true } } },
      orderBy: { received_at: "desc" },
    }),
    prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
  ]);

  if (!task) notFound();

  const vision = await loadVisionData(task, session?.user?.id ?? null, session?.user?.category);

  const linkedKeys = new Set(task.UploadLinks.map((l) => `${l.upload_table}-${l.upload_id}`));

  const allPickerItems = [
    ...photos.map((p) => ({
      upload_id: p.id, upload_table: "photos" as const,
      filename: p.filename ?? `photo-${p.id}`,
      category: p.category ?? null,
      farm_name: p.Farm?.Farm_Name ?? null,
      project_id: p.Project?.id ?? null,
      project_name: p.Project?.Project_Name ?? null,
      received_at: p.received_at.toISOString(),
      linked: linkedKeys.has(`photos-${p.id}`),
    })),
    ...labUploads.map((u) => ({
      upload_id: u.id, upload_table: "lab-member-uploads" as const,
      filename: u.filename ?? `upload-${u.id}`,
      category: u.category ?? null,
      farm_name: u.Farm?.Farm_Name ?? null,
      project_id: u.Project?.id ?? null,
      project_name: u.Project?.Project_Name ?? null,
      received_at: u.received_at.toISOString(),
      linked: linkedKeys.has(`lab-member-uploads-${u.id}`),
    })),
  ];

  return (
    <TaskDetailClient
      task={{
        id: task.id,
        description: task.description,
        classification: task.classification,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date?.toISOString().slice(0, 10) ?? null,
        experiment_id: task.experiment_id,
        experiment_name: task.Experiment?.experiment_name ?? null,
        farm_name: task.Experiment?.Farm?.Farm_Name ?? null,
        assignees: task.Assignees.filter((a) => a.User != null).map((a) => ({ id: a.User.id, name: a.User.name, email: a.User.email })),
        upload_count: task.UploadLinks.length,
        created_at: task.created_at.toISOString(),
        vikunja_task_id: task.vikunja_task_id ?? null,
      }}
      experiments={experiments.map((e) => ({
        id: e.id,
        name: `${e.experiment_name ?? `Exp #${e.id}`}${e.Farm?.Farm_Name ? ` — ${e.Farm.Farm_Name}` : ""}`,
      }))}
      users={users.map((u) => ({ id: u.id, name: u.name ?? u.email }))}
      pickerItems={allPickerItems}
      projects={projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project ${p.id}` }))}
      canEdit={canEdit(role)}
      canDelete={canDelete(role, editMode)}
      vision={vision}
    />
  );
  });
}

const VISION_CLASSIFICATIONS = new Set(["image annotation", "image classification"]);

// Machine-vision card data (components/vision-panel.tsx), only for image
// annotation/classification tasks. Basemap choices = ready basemaps on the
// task's experiment farm, or every ready one in the user's scope when the
// task has no experiment.
async function loadVisionData(
  task: { id: number; classification: string | null; experiment_id: number | null; UploadLinks: { upload_table: string }[] },
  userId: string | null,
  category: string | null | undefined,
): Promise<VisionPanelData | null> {
  if (!VISION_CLASSIFICATIONS.has(task.classification ?? "")) return null;
  const [job, experiment, scope] = await Promise.all([
    prisma.visionJob.findUnique({
      where: { task_id: task.id },
      include: {
        Classes: { orderBy: { sort_order: "asc" }, include: { _count: { select: { Labels: true } } } },
        Sources: { include: { _count: { select: { Labels: true } }, Basemap: { select: { farm_id: true, display_name: true, original_filename: true } } } },
        Runs: { orderBy: { created_at: "desc" }, take: 10, include: { Layer: { select: { farm_id: true } } } },
      },
    }),
    task.experiment_id ? prisma.farmExperiment.findUnique({ where: { id: task.experiment_id }, select: { farm_id: true } }) : null,
    getEffectiveScope(userId, category),
  ]);
  const farmId = experiment?.farm_id ?? null;
  const basemaps = await prisma.basemap.findMany({
    where: {
      tiling_status: "ready",
      ...(farmId != null ? { farm_id: farmId } : scope.hardScoped ? { farm_id: { in: scope.accessFarmIds } } : {}),
    },
    select: { id: true, display_name: true, original_filename: true, Farm: { select: { Farm_Name: true } } },
    orderBy: { created_at: "desc" },
    take: 100,
  });
  // Keep already-chosen basemaps listed even if they're on another farm.
  const chosenIds = (job?.Sources ?? []).filter((s) => s.basemap_id != null && !basemaps.some((b) => b.id === s.basemap_id)).map((s) => s.basemap_id!);
  const extra = chosenIds.length
    ? await prisma.basemap.findMany({ where: { id: { in: chosenIds } }, select: { id: true, display_name: true, original_filename: true, Farm: { select: { Farm_Name: true } } } })
    : [];

  return {
    processingConfigured,
    linkedPhotoCount: task.UploadLinks.filter((l) => l.upload_table === "photos" || l.upload_table === "lab-member-uploads").length,
    basemaps: [...basemaps, ...extra].map((b) => ({ id: b.id, name: b.display_name || b.original_filename, farm_name: b.Farm?.Farm_Name ?? "" })),
    job: job && {
      id: job.id,
      mode: job.mode,
      status: job.status,
      settings: (job.settings ?? {}) as Record<string, unknown>,
      classes: job.Classes.map((c) => ({ id: c.id, name: c.name, color: c.color, is_background: c.is_background, label_count: c._count.Labels })),
      sources: job.Sources.map((s) => ({
        id: s.id, kind: s.kind, basemap_id: s.basemap_id, farm_id: s.Basemap?.farm_id ?? null,
        name: s.kind === "basemap" ? (s.Basemap?.display_name || s.Basemap?.original_filename || `Basemap ${s.basemap_id}`) : `${s.upload_table} #${s.upload_id}`,
        label_count: s._count.Labels,
        meta: (s.meta ?? null) as Record<string, unknown> | null,
      })),
      runs: job.Runs.map((r) => ({
        id: r.id, status: r.status, created_at: r.created_at.toISOString(), finished_at: r.finished_at?.toISOString() ?? null,
        label_count: r.label_count, prediction_count: r.prediction_count, error_message: r.error_message,
        params: (r.params ?? {}) as Record<string, unknown>, metrics: (r.metrics ?? null) as Record<string, unknown> | null,
        layer_farm_id: r.Layer?.farm_id ?? null,
      })),
    },
  };
}
