import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canCreate, canDelete, type Role } from "@/lib/roles";
import { TasksClient } from "./tasks-client";

export default async function TasksPage() {
  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;

  const [tasks, experiments, users] = await Promise.all([
    prisma.task.findMany({
      include: {
        Experiment: { select: { id: true, experiment_name: true, Farm: { select: { Farm_Name: true } } } },
        Assignees:  { include: { User: { select: { id: true, name: true, email: true } } } },
        _count:     { select: { UploadLinks: true } },
      },
      orderBy: [{ status: "asc" }, { due_date: "asc" }, { created_at: "desc" }],
    }),
    prisma.farmExperiment.findMany({
      select: { id: true, experiment_name: true, Farm: { select: { Farm_Name: true } } },
      orderBy: { experiment_name: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <TasksClient
      initialTasks={tasks.map((t) => ({
        id: t.id,
        description: t.description,
        classification: t.classification,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date?.toISOString().slice(0, 10) ?? null,
        experiment_id: t.experiment_id,
        experiment_name: t.Experiment?.experiment_name ?? null,
        farm_name: t.Experiment?.Farm?.Farm_Name ?? null,
        assignees: t.Assignees.map((a) => ({ id: a.User.id, name: a.User.name, email: a.User.email })),
        upload_count: t._count.UploadLinks,
        created_at: t.created_at.toISOString(),
      }))}
      experiments={experiments.map((e) => ({
        id: e.id,
        name: `${e.experiment_name ?? `Exp #${e.id}`}${e.Farm?.Farm_Name ? ` — ${e.Farm.Farm_Name}` : ""}`,
      }))}
      users={users.map((u) => ({ id: u.id, name: u.name ?? u.email }))}
      canCreate={canCreate(role)}
      canDelete={canDelete(role, editMode)}
    />
  );
}
