import { NextResponse } from "next/server";
import { authenticateUpload } from "@/lib/upload-auth";
import { queryAllUploads, parseQueryParams } from "@/lib/data-api";
import type { NormalizedUpload } from "@/lib/data-api";

interface ManifestFarm {
  id: number | null;
  name: string;
  file_count: number;
  files: NormalizedUpload[];
}

interface ManifestProject {
  id: number | null;
  name: string;
  file_count: number;
  farms: ManifestFarm[];
}

export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { limit: _l, offset: _o, ...queryOpts } = parseQueryParams(new URL(req.url));
  const all = await queryAllUploads(queryOpts);

  // Group project → farm → files
  const projectMap = new Map<
    number | null,
    { name: string; farms: Map<number | null, { name: string; files: NormalizedUpload[] }> }
  >();

  for (const item of all) {
    const pk = item.project_id;
    if (!projectMap.has(pk)) {
      projectMap.set(pk, { name: item.project_name ?? "Unassigned", farms: new Map() });
    }
    const proj = projectMap.get(pk)!;

    const fk = item.farm_id;
    if (!proj.farms.has(fk)) {
      proj.farms.set(fk, { name: item.farm_name ?? "Unknown Farm", files: [] });
    }
    proj.farms.get(fk)!.files.push(item);
  }

  const projects: ManifestProject[] = [];
  for (const [projId, projData] of projectMap) {
    const farms: ManifestFarm[] = [];
    for (const [farmId, farmData] of projData.farms) {
      farms.push({
        id: farmId,
        name: farmData.name,
        file_count: farmData.files.length,
        files: farmData.files,
      });
    }
    farms.sort((a, b) => a.name.localeCompare(b.name));
    projects.push({
      id: projId,
      name: projData.name,
      file_count: farms.reduce((s, f) => s + f.file_count, 0),
      farms,
    });
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    total: all.length,
    projects,
  });
}
