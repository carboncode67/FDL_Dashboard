import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { UploadItem } from "../../data-sorting-client";
import DetailClient from "./detail-client";

const ALLOWED = ["photos", "notes", "recordings", "locations", "lab-member-uploads"] as const;
type TableSlug = (typeof ALLOWED)[number];

function isAllowed(t: string): t is TableSlug {
  return (ALLOWED as readonly string[]).includes(t);
}

const INCLUDE_OPTS = {
  Contact: { select: { name: true } },
  Farm:    { select: { Farm_Name: true } },
  Project: { select: { Project_Name: true } },
} as const;

async function fetchItem(table: TableSlug, id: number): Promise<UploadItem | null> {
  switch (table) {
    case "photos": {
      const r = await prisma.photo.findUnique({ where: { id }, include: INCLUDE_OPTS });
      if (!r) return null;
      return {
        id: r.id, table: "photos", uploader: r.Contact?.name ?? null,
        uploader_type: "contact", farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
        media_type: "photo", date_collected: r.timestamp?.toISOString() ?? null,
        received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
        category: r.category ?? null, description: r.description ?? null,
        project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
        filename: r.filename || null, content: r.note ?? null,
        latitude: r.latitude ?? null, longitude: r.longitude ?? null,
      };
    }
    case "notes": {
      const r = await prisma.note.findUnique({ where: { id }, include: INCLUDE_OPTS });
      if (!r) return null;
      return {
        id: r.id, table: "notes", uploader: r.Contact?.name ?? null,
        uploader_type: "contact", farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
        media_type: "note", date_collected: r.timestamp?.toISOString() ?? null,
        received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
        category: r.category ?? null, description: r.description ?? null,
        project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
        filename: null, content: r.content,
        latitude: r.latitude ?? null, longitude: r.longitude ?? null,
      };
    }
    case "recordings": {
      const r = await prisma.recording.findUnique({ where: { id }, include: INCLUDE_OPTS });
      if (!r) return null;
      return {
        id: r.id, table: "recordings", uploader: r.Contact?.name ?? null,
        uploader_type: "contact", farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
        media_type: "recording", date_collected: r.start_time?.toISOString() ?? null,
        received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
        category: r.category ?? null, description: r.description ?? null,
        project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
        filename: r.filename || null, content: null, latitude: null, longitude: null,
      };
    }
    case "locations": {
      const r = await prisma.location.findUnique({ where: { id }, include: INCLUDE_OPTS });
      if (!r) return null;
      return {
        id: r.id, table: "locations", uploader: r.Contact?.name ?? null,
        uploader_type: "contact", farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
        media_type: "location", date_collected: r.start_time?.toISOString() ?? null,
        received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
        category: r.category ?? null, description: r.description ?? null,
        project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
        filename: null, content: r.name ?? null, latitude: null, longitude: null,
      };
    }
    case "lab-member-uploads": {
      const r = await prisma.labMemberUpload.findUnique({
        where: { id },
        include: {
          User:    { select: { name: true } },
          Farm:    { select: { Farm_Name: true } },
          Project: { select: { Project_Name: true } },
        },
      });
      if (!r) return null;
      return {
        id: r.id, table: "lab-member-uploads", uploader: r.User?.name ?? null,
        uploader_type: "lab_member", farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
        media_type: r.media_type, date_collected: r.date_collected?.toISOString() ?? null,
        received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
        category: r.category ?? null, description: r.description ?? null,
        project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
        filename: r.filename ?? null, content: r.content ?? null,
        latitude: r.latitude ?? null, longitude: r.longitude ?? null,
      };
    }
  }
}

// Replicate the main page's item list (all tables, sorted by received_at desc) for nav context
async function fetchAllItems(): Promise<UploadItem[]> {
  const [photos, notes, recordings, locations, labUploads] = await Promise.all([
    prisma.photo.findMany({
      include: INCLUDE_OPTS,
      orderBy: { received_at: "desc" },
    }),
    prisma.note.findMany({
      include: INCLUDE_OPTS,
      orderBy: { received_at: "desc" },
    }),
    prisma.recording.findMany({
      include: INCLUDE_OPTS,
      orderBy: { received_at: "desc" },
    }),
    prisma.location.findMany({
      include: INCLUDE_OPTS,
      orderBy: { received_at: "desc" },
    }),
    prisma.labMemberUpload.findMany({
      include: {
        User:    { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
  ]);

  return [
    ...photos.map((r) => ({
      id: r.id, table: "photos" as const, uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const, farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
      media_type: "photo", date_collected: r.timestamp?.toISOString() ?? null,
      received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
      category: r.category ?? null, description: r.description ?? null,
      project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
      filename: r.filename || null, content: r.note ?? null,
      latitude: r.latitude ?? null, longitude: r.longitude ?? null,
    })),
    ...notes.map((r) => ({
      id: r.id, table: "notes" as const, uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const, farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
      media_type: "note", date_collected: r.timestamp?.toISOString() ?? null,
      received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
      category: r.category ?? null, description: r.description ?? null,
      project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
      filename: null, content: r.content,
      latitude: r.latitude ?? null, longitude: r.longitude ?? null,
    })),
    ...recordings.map((r) => ({
      id: r.id, table: "recordings" as const, uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const, farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
      media_type: "recording", date_collected: r.start_time?.toISOString() ?? null,
      received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
      category: r.category ?? null, description: r.description ?? null,
      project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
      filename: r.filename || null, content: null, latitude: null, longitude: null,
    })),
    ...locations.map((r) => ({
      id: r.id, table: "locations" as const, uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const, farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
      media_type: "location", date_collected: r.start_time?.toISOString() ?? null,
      received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
      category: r.category ?? null, description: r.description ?? null,
      project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
      filename: null, content: r.name ?? null, latitude: null, longitude: null,
    })),
    ...labUploads.map((r) => ({
      id: r.id, table: "lab-member-uploads" as const, uploader: r.User?.name ?? null,
      uploader_type: "lab_member" as const, farm: r.Farm?.Farm_Name ?? null, farm_id: r.farm_id ?? null,
      media_type: r.media_type, date_collected: r.date_collected?.toISOString() ?? null,
      received_at: r.received_at.toISOString(), status: r.status, stage: r.stage ?? null,
      category: r.category ?? null, description: r.description ?? null,
      project_id: r.project_id ?? null, project_name: r.Project?.Project_Name ?? null,
      filename: r.filename ?? null, content: r.content ?? null,
      latitude: r.latitude ?? null, longitude: r.longitude ?? null,
    })),
  ].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
}

function applyFilters(
  items: UploadItem[],
  filterStatus: string,
  filterType: string,
  filterFarm: string,
  search: string,
) {
  return items.filter((item) => {
    if (filterStatus !== "all" && item.status !== Number(filterStatus)) return false;
    if (filterType !== "all" && item.media_type !== filterType) return false;
    if (filterFarm !== "all" && item.farm_id !== Number(filterFarm)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [item.uploader, item.farm, item.category, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export default async function DetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string; id: string }>;
  searchParams: Promise<{ status?: string; type?: string; farm?: string; search?: string }>;
}) {
  const { table, id } = await params;
  const sp = await searchParams;

  if (!isAllowed(table)) notFound();

  const itemId = parseInt(id);
  if (isNaN(itemId)) notFound();

  const filterStatus = sp.status ?? "all";
  const filterType   = sp.type   ?? "all";
  const filterFarm   = sp.farm   ?? "all";
  const search       = sp.search ?? "";

  const [item, allItems, farms, projects] = await Promise.all([
    fetchItem(table, itemId),
    fetchAllItems(),
    prisma.farm.findMany({ select: { id: true, Farm_Name: true }, orderBy: { Farm_Name: "asc" } }),
    prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
  ]);

  if (!item) notFound();

  const filtered = applyFilters(allItems, filterStatus, filterType, filterFarm, search);
  const idx = filtered.findIndex((x) => x.table === table && x.id === itemId);
  const prev = idx > 0 ? filtered[idx - 1] : null;
  const next = idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1] : null;
  const position = idx >= 0 ? idx + 1 : null;
  const total = filtered.length;

  const filterParams = new URLSearchParams({ status: filterStatus, type: filterType, farm: filterFarm, search });

  return (
    <DetailClient
      item={item}
      farms={farms.map((f) => ({ id: f.id, name: f.Farm_Name ?? `Farm ${f.id}` }))}
      projects={projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project ${p.id}` }))}
      prevHref={prev ? `/data-sorting/${prev.table}/${prev.id}?${filterParams}` : null}
      nextHref={next ? `/data-sorting/${next.table}/${next.id}?${filterParams}` : null}
      position={position}
      total={total}
      backHref={`/data-sorting?${filterParams}`}
    />
  );
}
