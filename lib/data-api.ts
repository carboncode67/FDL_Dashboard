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
  depth_filename: string | null;
  depth_download_url: string | null;
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

// Resolve project for an upload: direct project_id takes precedence; fall back
// to the farm's project via FarmExperiment / ProjectFarm linkage.
function resolveProject(
  directProjectId: number | null,
  directProject: { Project_Name?: string | null; title?: string | null } | null,
  farmId: number | null,
  farmToProject: Map<number, { id: number; name: string | null }>
): { project_id: number | null; project_name: string | null } {
  if (directProjectId != null) {
    return { project_id: directProjectId, project_name: pName(directProject) };
  }
  if (farmId != null) {
    const fp = farmToProject.get(farmId);
    if (fp) return { project_id: fp.id, project_name: fp.name };
  }
  return { project_id: null, project_name: null };
}

export async function queryAllUploads(opts: QueryOptions): Promise<NormalizedUpload[]> {
  const typesToInclude = opts.types ?? ([...UPLOAD_TABLES] as UploadTable[]);

  const baseWhere = {
    ...(opts.project_id != null && { project_id: opts.project_id }),
    ...(opts.farm_id != null && { farm_id: opts.farm_id }),
    ...(opts.status?.length && { status: { in: opts.status } }),
  };

  // Build farm→project fallback map from experiment and direct junction linkages
  const [farmExpLinks, projectFarmLinks] = await Promise.all([
    prisma.farmExperiment.findMany({
      where: { farm_id: { not: null }, project_id: { not: null } },
      select: { farm_id: true, project_id: true, Project: { select: { Project_Name: true, title: true } } },
    }),
    prisma.projectFarm.findMany({
      select: { Farms_id: true, Projects_id: true, Project: { select: { Project_Name: true, title: true } } },
    }),
  ]);

  const farmToProject = new Map<number, { id: number; name: string | null }>();
  for (const fe of farmExpLinks) {
    if (!fe.farm_id || !fe.project_id || farmToProject.has(fe.farm_id)) continue;
    farmToProject.set(fe.farm_id, { id: fe.project_id, name: pName(fe.Project) });
  }
  for (const pf of projectFarmLinks) {
    if (farmToProject.has(pf.Farms_id)) continue;
    farmToProject.set(pf.Farms_id, { id: pf.Projects_id, name: pName(pf.Project) });
  }

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
    const { project_id, project_name: proj } = resolveProject(row.project_id, row.Project, row.farm_id, farmToProject);
    const farm = fName(row.Farm);
    results.push({
      id: row.id,
      table: "photos",
      type: "photo",
      filename: row.filename,
      content: null,
      project_id,
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
      depth_filename: row.depth_filename ?? null,
      depth_download_url: row.depth_filename ? `/api/data/files/depth/photos/${row.id}` : null,
    });
  }

  for (const row of notes) {
    const { project_id, project_name: proj } = resolveProject(row.project_id, row.Project, row.farm_id, farmToProject);
    const farm = fName(row.Farm);
    const filename = `note_${row.id}.txt`;
    results.push({
      id: row.id,
      table: "notes",
      type: "note",
      filename,
      content: row.content,
      project_id,
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
      depth_filename: null,
      depth_download_url: null,
    });
  }

  for (const row of recordings) {
    const { project_id, project_name: proj } = resolveProject(row.project_id, row.Project, row.farm_id, farmToProject);
    const farm = fName(row.Farm);
    results.push({
      id: row.id,
      table: "recordings",
      type: "recording",
      filename: row.filename,
      content: null,
      project_id,
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
      depth_filename: null,
      depth_download_url: null,
    });
  }

  for (const row of locations) {
    const { project_id, project_name: proj } = resolveProject(row.project_id, row.Project, row.farm_id, farmToProject);
    const farm = fName(row.Farm);
    const filename = row.track_filename ?? `location_${row.id}.json`;
    results.push({
      id: row.id,
      table: "locations",
      type: "location",
      filename,
      content: null,
      project_id,
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
      depth_filename: null,
      depth_download_url: null,
    });
  }

  for (const row of labUploads) {
    const { project_id, project_name: proj } = resolveProject(row.project_id, row.Project, row.farm_id, farmToProject);
    const farm = fName(row.Farm);
    const isNote = row.media_type === "note";
    const filename = isNote ? `note_${row.id}.txt` : (row.filename ?? `upload_${row.id}`);
    results.push({
      id: row.id,
      table: "lab-member-uploads",
      type: row.media_type,
      filename,
      content: row.content,
      project_id,
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
      depth_filename: row.depth_filename ?? null,
      depth_download_url: row.depth_filename ? `/api/data/files/depth/lab-member-uploads/${row.id}` : null,
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
