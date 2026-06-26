const CVAT_URL = process.env.CVAT_URL?.replace(/\/$/, "");
const CVAT_USERNAME = process.env.CVAT_USERNAME;
const CVAT_PASSWORD = process.env.CVAT_PASSWORD;

export const cvatConfigured = Boolean(CVAT_URL && CVAT_USERNAME && CVAT_PASSWORD);

export interface CvatLabel {
  name: string;
  type?: "any" | "bbox" | "polygon" | "polyline" | "points" | "ellipse" | "cuboid" | "skeleton" | "tag";
  color?: string;
  attributes?: { name: string; input_type: string; values: string[] }[];
}

function authHeader(): Record<string, string> {
  const creds = Buffer.from(`${CVAT_USERNAME}:${CVAT_PASSWORD}`).toString("base64");
  return { Authorization: `Basic ${creds}`, "Content-Type": "application/json" };
}

async function cvatFetch(path: string, init?: RequestInit) {
  if (!CVAT_URL) throw new Error("CVAT_URL is not configured");
  const res = await fetch(`${CVAT_URL}/api${path}`, {
    ...init,
    headers: { ...authHeader(), ...(init?.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CVAT ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function createCvatProject(name: string, labels: CvatLabel[]) {
  return cvatFetch("/projects", {
    method: "POST",
    body: JSON.stringify({ name, labels }),
  });
}

export async function createCvatTask(cvatProjectId: number, name: string, labels: CvatLabel[]) {
  return cvatFetch("/tasks", {
    method: "POST",
    body: JSON.stringify({ name, project_id: cvatProjectId, labels }),
  });
}

export async function addUrlsToTask(taskId: number, imageUrls: string[]) {
  return cvatFetch(`/tasks/${taskId}/data`, {
    method: "POST",
    body: JSON.stringify({ image_quality: 70, remote_files: imageUrls }),
  });
}

export async function getCvatTaskAnnotations(taskId: number) {
  return cvatFetch(`/tasks/${taskId}/annotations?format=COCO%201.0`);
}

export async function deleteCvatTask(taskId: number) {
  return cvatFetch(`/tasks/${taskId}`, { method: "DELETE" });
}

export function cvatTaskUrl(taskId: number) {
  return `${CVAT_URL}/tasks/${taskId}`;
}
