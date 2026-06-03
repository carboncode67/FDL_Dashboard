import { prisma } from "@/lib/prisma";

export const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export type UploadTable = "photos" | "notes" | "recordings" | "locations" | "lab-member-uploads";
export const UPLOAD_TABLES = [
  "photos",
  "notes",
  "recordings",
  "locations",
  "lab-member-uploads",
] as const;

export function isUploadTable(t: string): t is UploadTable {
  return (UPLOAD_TABLES as readonly string[]).includes(t);
}

function sanitizeName(s: string | null | undefined): string {
  if (!s?.trim()) return "";
  return s.replace(/[/\\?%*:|"<>]/g, "-").trim();
}

export function buildSuggestedPath(
  projectName: string | null,
  farmName: string | null,
  category: string | null,
  filename: string
): string {
  const p = sanitizeName(projectName) || "Unassigned";
  const f = sanitizeName(farmName) || "Unknown Farm";
  const c = sanitizeName(category) || "Uncategorized";
  return `${p}/${f}/${c}/${filename}`;
}

export interface NormalizedUpload {
  id: number;
  table: UploadTable;
  type: string;
  filename: string | null;
  content: string | null;
  project_id: number | null;
  project_name: string | null;
  farm_id: number | null;
  farm_name: string | null;
  category: string | null;
  description: string | null;
  status: number;
  received_at: Date;
  latitude: number | null;
  longitude: number | null;
  suggested_path: string;
  download_url: string;
}

export interface QueryOptions {
  project_id?: number;
  farm_id?: number;
  status?: number[];
  types?: UploadTable[];
}

function pName(p: { Project_Name?: string | null; title?: string | null } | null): string | null {
  return p?.Project_Name ?? p?.title ?? null;
}

function fName(f: { Farm_Name?: string | null; title?: string | null } | null): string | null {
  return f?.Farm_Name ?? f?.title ?? null;
}

export async function queryAllUploads(opts: QueryOptions): Promise<NormalizedUpload[]> {
  const typesToInclude = opts.types ?? ([...UPLOAD_TABLES] as UploadTable[]);

  const baseWhere = {
    ...(opts.project_id != null && { project_id: opts.project_id }),
    ...(opts.farm_id != null && { farm_id: opts.farm_id }),
    ...(opts.status?.length && { status: { in: opts.status } }),
  };

  const [photos, notes, recordings, locations, labUploads] = await Promise.all([
    typesToInclude.includes("photos")
      ? prisma.photo.findMany({ where: baseWhere, include: { Farm: true, Project: true } })
      : Promise.resolve([]),
    typesToInclude.includes("notes")
      ? prisma.note.findMany({ where: baseWhere, include: { Farm: true, Project: true } })
      : Promise.resolve([]),
    typesToInclude.includes("recordings")
      ? prisma.recording.findMany({ where: baseWhere, include: { Farm: true, Project: true } })
      : Promise.resolve([]),
    typesToInclude.includes("locations")
      ? prisma.location.findMany({ where: baseWhere, include: { Farm: true, Project: true } })
      : Promise.resolve([]),
    typesToInclude.includes("lab-member-uploads")
      ? prisma.labMemberUpload.findMany({ where: baseWhere, include: { Farm: true, Project: true } })
      : Promise.resolve([]),
  ]);

  const results: NormalizedUpload[] = [];

  for (const row of photos) {
    const proj = pName(row.Project);
    const farm = fName(row.Farm);
    results.push({
      id: row.id,
      table: "photos",
      type: "photo",
      filename: row.filename,
      content: null,
      project_id: row.project_id,
      project_name: proj,
      farm_id: row.farm_id,
      farm_name: farm,
      category: row.category,
      description: row.description,
      status: row.status,
      received_at: row.received_at,
      latitude: row.latitude,
      longitude: row.longitude,
      suggested_path: buildSuggestedPath(proj, farm, row.category, row.filename),
      download_url: `/api/data/files/photos/${row.id}`,
    });
  }

  for (const row of notes) {
    const proj = pName(row.Project);
    const farm = fName(row.Farm);
    const filename = `note_${row.id}.txt`;
    results.push({
      id: row.id,
      table: "notes",
      type: "note",
      filename,
      content: row.content,
      project_id: row.project_id,
      project_name: proj,
      farm_id: row.farm_id,
      farm_name: farm,
      category: row.category,
      description: row.description,
      status: row.status,
      received_at: row.received_at,
      latitude: row.latitude,
      longitude: row.longitude,
      suggested_path: buildSuggestedPath(proj, farm, row.category, filename),
      download_url: `/api/data/files/notes/${row.id}`,
    });
  }

  for (const row of recordings) {
    const proj = pName(row.Project);
    const farm = fName(row.Farm);
    results.push({
      id: row.id,
      table: "recordings",
      type: "recording",
      filename: row.filename,
      content: null,
      project_id: row.project_id,
      project_name: proj,
      farm_id: row.farm_id,
      farm_name: farm,
      category: row.category,
      description: row.description,
      status: row.status,
      received_at: row.received_at,
      latitude: null,
      longitude: null,
      suggested_path: buildSuggestedPath(proj, farm, row.category, row.filename),
      download_url: `/api/data/files/recordings/${row.id}`,
    });
  }

  for (const row of locations) {
    const proj = pName(row.Project);
    const farm = fName(row.Farm);
    const filename = row.track_filename ?? `location_${row.id}.json`;
    results.push({
      id: row.id,
      table: "locations",
      type: "location",
      filename,
      content: null,
      project_id: row.project_id,
      project_name: proj,
      farm_id: row.farm_id,
      farm_name: farm,
      category: row.category,
      description: row.description,
      status: row.status,
      received_at: row.received_at,
      latitude: null,
      longitude: null,
      suggested_path: buildSuggestedPath(proj, farm, row.category, filename),
      download_url: `/api/data/files/locations/${row.id}`,
    });
  }

  for (const row of labUploads) {
    const proj = pName(row.Project);
    const farm = fName(row.Farm);
    const isNote = row.media_type === "note";
    const filename = isNote ? `note_${row.id}.txt` : (row.filename ?? `upload_${row.id}`);
    results.push({
      id: row.id,
      table: "lab-member-uploads",
      type: row.media_type,
      filename,
      content: row.content,
      project_id: row.project_id,
      project_name: proj,
      farm_id: row.farm_id,
      farm_name: farm,
      category: row.category,
      description: row.description,
      status: row.status,
      received_at: row.received_at,
      latitude: row.latitude,
      longitude: row.longitude,
      suggested_path: buildSuggestedPath(proj, farm, row.category, filename),
      download_url: `/api/data/files/lab-member-uploads/${row.id}`,
    });
  }

  results.sort((a, b) => b.received_at.getTime() - a.received_at.getTime());
  return results;
}

export function parseQueryParams(url: URL): QueryOptions & { limit: number; offset: number } {
  const rawProject = url.searchParams.get("project_id");
  const rawFarm = url.searchParams.get("farm_id");
  const rawStatus = url.searchParams.get("status");
  const rawType = url.searchParams.get("type");

  return {
    project_id: rawProject !== null ? Number(rawProject) : undefined,
    farm_id: rawFarm !== null ? Number(rawFarm) : undefined,
    status: rawStatus
      ? rawStatus.split(",").map(Number).filter((n) => [1, 2, 3, 4].includes(n))
      : undefined,
    types: rawType
      ? rawType
          .split(",")
          .filter((t): t is UploadTable => (UPLOAD_TABLES as readonly string[]).includes(t))
      : undefined,
    limit: Math.min(Number(url.searchParams.get("limit") ?? "200"), 1000),
    offset: Number(url.searchParams.get("offset") ?? "0"),
  };
}
