import { prisma } from "@/lib/prisma";

const VIKUNJA_URL = process.env.VIKUNJA_URL?.replace(/\/$/, "");
const VIKUNJA_TOKEN = process.env.VIKUNJA_TOKEN;

export const vikunjaConfigured = () => Boolean(VIKUNJA_URL && VIKUNJA_TOKEN);

export interface FdlTaskInput {
  description: string;
  classification?: string | null;
  status: string;
  priority: string;
  due_date?: Date | null;
}

// FDL priority string → Vikunja priority int (0=unset, 1=low, 2=medium, 3=high)
function toVikunjaPriority(p: string): number {
  if (p === "low") return 1;
  if (p === "high") return 3;
  return 2; // medium
}

// Vikunja priority int → FDL priority string
export function fromVikunjaPriority(p: number): string {
  if (p <= 1) return "low";
  if (p >= 3) return "high";
  return "medium";
}

// FDL status → Vikunja done flag
function toVikunjaDone(status: string): boolean {
  return status === "complete";
}

// Vikunja done flag → FDL status (preserves "in progress" if not done)
export function fromVikunjaStatus(done: boolean, currentFdlStatus: string): string {
  if (done) return "complete";
  if (currentFdlStatus === "complete") return "not started";
  return currentFdlStatus;
}

async function vikunjaFetch(path: string, init?: RequestInit) {
  if (!VIKUNJA_URL || !VIKUNJA_TOKEN) throw new Error("Vikunja is not configured");
  const res = await fetch(`${VIKUNJA_URL}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${VIKUNJA_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vikunja ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function buildVikunjaPayload(task: FdlTaskInput) {
  return {
    title: task.description,
    description: task.classification ? `FDL Classification: ${task.classification}` : "",
    done: toVikunjaDone(task.status),
    priority: toVikunjaPriority(task.priority),
    due_date: task.due_date ? task.due_date.toISOString() : "0001-01-01T00:00:00Z",
  };
}

export async function createVikunjaProject(title: string, description?: string): Promise<number> {
  const project = await vikunjaFetch("/projects", {
    method: "PUT",
    body: JSON.stringify({ title, description: description ?? "" }),
  });
  return project.id as number;
}

export async function getOrCreateVikunjaProject(experiment: {
  id: number;
  experiment_name: string | null;
  vikunja_project_id: number | null;
}): Promise<number> {
  if (experiment.vikunja_project_id) return experiment.vikunja_project_id;

  const title = experiment.experiment_name ?? `Experiment ${experiment.id}`;
  const projectId = await createVikunjaProject(`FDL: ${title}`);

  await prisma.farmExperiment.update({
    where: { id: experiment.id },
    data: { vikunja_project_id: projectId },
  });

  return projectId;
}

export async function createVikunjaTask(projectId: number, task: FdlTaskInput): Promise<number> {
  const result = await vikunjaFetch(`/projects/${projectId}/tasks`, {
    method: "PUT",
    body: JSON.stringify(buildVikunjaPayload(task)),
  });
  return result.id as number;
}

export async function updateVikunjaTask(vikunjaTaskId: number, task: FdlTaskInput): Promise<void> {
  await vikunjaFetch(`/tasks/${vikunjaTaskId}`, {
    method: "POST",
    body: JSON.stringify(buildVikunjaPayload(task)),
  });
}

export async function deleteVikunjaTask(vikunjaTaskId: number): Promise<void> {
  await vikunjaFetch(`/tasks/${vikunjaTaskId}`, { method: "DELETE" });
}

export function vikunjaTaskUrl(vikunjaTaskId: number): string {
  return `${VIKUNJA_URL}/tasks/${vikunjaTaskId}`;
}
