import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { TaskDetailClient } from "./task-detail-client";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
        assignees: task.Assignees.map((a) => ({ id: a.User.id, name: a.User.name, email: a.User.email })),
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
    />
  );
}
