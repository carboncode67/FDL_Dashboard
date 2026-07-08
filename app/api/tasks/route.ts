import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { vikunjaConfigured, getOrCreateVikunjaProject, createVikunjaTask } from "@/lib/vikunja";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const experimentId   = searchParams.get("experiment_id");
  const status         = searchParams.get("status");
  const priority       = searchParams.get("priority");
  const classification = searchParams.get("classification");
  const assigneeId     = searchParams.get("assignee_id");

  const tasks = await prisma.task.findMany({
    where: {
      ...(experimentId ? { experiment_id: parseInt(experimentId) } : {}),
      ...(status        ? { status }         : {}),
      ...(priority      ? { priority }       : {}),
      ...(classification ? { classification } : {}),
      ...(assigneeId    ? { Assignees: { some: { user_id: assigneeId } } } : {}),
    },
    include: {
      Experiment: { select: { id: true, experiment_name: true, farm_id: true, Farm: { select: { Farm_Name: true } } } },
      Assignees:  { include: { User: { select: { id: true, name: true, email: true } } } },
      _count:     { select: { UploadLinks: true } },
    },
    orderBy: [{ priority: "asc" }, { due_date: "asc" }, { created_at: "desc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    description: string;
    classification?: string;
    experiment_id?: number;
    status?: string;
    priority?: string;
    due_date?: string;
    assignee_ids?: string[];
  };

  const { description, classification, experiment_id, status, priority, due_date, assignee_ids = [] } = body;
  if (!description?.trim()) return NextResponse.json({ error: "description is required" }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      description,
      classification:  classification ?? null,
      experiment_id:   experiment_id  ?? null,
      status:          status         ?? "not started",
      priority:        priority       ?? "medium",
      due_date:        due_date       ? new Date(due_date) : null,
      Assignees: assignee_ids.length
        ? { create: assignee_ids.map((user_id) => ({ user_id })) }
        : undefined,
    },
    include: {
      Assignees: { include: { User: { select: { id: true, name: true, email: true } } } },
      _count:    { select: { UploadLinks: true } },
    },
  });

  if (vikunjaConfigured() && task.experiment_id) {
    try {
      const experiment = await prisma.farmExperiment.findUnique({
        where: { id: task.experiment_id },
        select: { id: true, experiment_name: true, vikunja_project_id: true },
      });
      if (experiment) {
        const projectId = await getOrCreateVikunjaProject(experiment);
        const vikunjaTaskId = await createVikunjaTask(projectId, {
          description: task.description,
          classification: task.classification,
          status: task.status,
          priority: task.priority,
          due_date: task.due_date,
          assignee_emails: task.Assignees.map((a) => a.User.email),
        });
        await prisma.task.update({ where: { id: task.id }, data: { vikunja_task_id: vikunjaTaskId } });
        (task as typeof task & { vikunja_task_id?: number }).vikunja_task_id = vikunjaTaskId;
      }
    } catch (err) {
      console.warn("Vikunja push failed (task create):", err);
    }
  }

  return NextResponse.json(task, { status: 201 });
}
