import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canDelete, type Role } from "@/lib/roles";
import { getUserFilters } from "@/lib/get-user-filters";
import { DataSortingClient, UploadItem } from "./data-sorting-client";

export default async function DataSortingPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [{ projectIds, farmIds, showUnassigned }, editMode] = await Promise.all([
    getUserFilters(userId),
    getEditMode(),
  ]);

  const projectWhere = projectIds.length > 0 ? { project_id: { in: projectIds } } : {};
  const farmWhere =
    farmIds.length > 0
      ? { OR: [{ farm_id: { in: farmIds } }, ...(showUnassigned ? [{ farm_id: null as null }] : [])] }
      : {};
  const baseWhere = { ...projectWhere, ...farmWhere };

  const [photos, notes, recordings, locations, labUploads, projects, farms, annotationCounts] = await Promise.all([
    prisma.photo.findMany({
      where: baseWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.note.findMany({
      where: baseWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.recording.findMany({
      where: baseWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.location.findMany({
      where: baseWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.labMemberUpload.findMany({
      where: baseWhere,
      include: {
        User: { select: { name: true } },
        Farm:      { select: { Farm_Name: true } },
        Project:   { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.project.findMany({
      select: { id: true, Project_Name: true },
      orderBy: { Project_Name: "asc" },
    }),
    prisma.farm.findMany({
      select: { id: true, Farm_Name: true },
      orderBy: { Farm_Name: "asc" },
    }),
    prisma.annotation.groupBy({ by: ["upload_id", "upload_table"], _count: { id: true } }),
  ]);

  const role = (session?.user?.role ?? "viewer") as Role;

  const activeFilter =
    projectIds.length > 0 || farmIds.length > 0
      ? { projectCount: projectIds.length, farmCount: farmIds.length }
      : null;

  const showDelete = canDelete(role, editMode);

  const annCountMap = new Map(
    annotationCounts.map((a) => [`${a.upload_table}-${a.upload_id}`, a._count.id])
  );

  const items: UploadItem[] = [
    ...photos.map((r) => ({
      id: r.id,
      table: "photos" as const,
      uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const,
      farm: r.Farm?.Farm_Name ?? null,
      farm_id: r.farm_id ?? null,
      media_type: "photo",
      date_collected: r.timestamp?.toISOString() ?? null,
      received_at: r.received_at.toISOString(),
      status: r.status,
      stage: r.stage ?? null,
      category: r.category ?? null,
      description: r.description ?? null,
      project_id: r.project_id ?? null,
      project_name: r.Project?.Project_Name ?? null,
      filename: r.filename || null,
      content: r.note ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      gps_track: null,
      merge_group_id: r.merge_group_id ?? null,
      end_time: null,
      annotation_count: annCountMap.get(`photos-${r.id}`) ?? 0,
    })),
    ...notes.map((r) => ({
      annotation_count: 0,
      id: r.id,
      table: "notes" as const,
      uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const,
      farm: r.Farm?.Farm_Name ?? null,
      farm_id: r.farm_id ?? null,
      media_type: "note",
      date_collected: r.timestamp?.toISOString() ?? null,
      received_at: r.received_at.toISOString(),
      status: r.status,
      stage: r.stage ?? null,
      category: r.category ?? null,
      description: r.description ?? null,
      project_id: r.project_id ?? null,
      project_name: r.Project?.Project_Name ?? null,
      filename: null,
      content: r.content,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      gps_track: null,
      merge_group_id: r.merge_group_id ?? null,
      end_time: null,
    })),
    ...recordings.map((r) => ({
      annotation_count: 0,
      id: r.id,
      table: "recordings" as const,
      uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const,
      farm: r.Farm?.Farm_Name ?? null,
      farm_id: r.farm_id ?? null,
      media_type: "recording",
      date_collected: r.start_time?.toISOString() ?? null,
      received_at: r.received_at.toISOString(),
      status: r.status,
      stage: r.stage ?? null,
      category: r.category ?? null,
      description: r.description ?? null,
      project_id: r.project_id ?? null,
      project_name: r.Project?.Project_Name ?? null,
      filename: r.filename || null,
      content: null,
      latitude: null,
      longitude: null,
      gps_track: null,
      merge_group_id: r.merge_group_id ?? null,
      end_time: r.end_time?.toISOString() ?? null,
    })),
    ...locations.map((r) => ({
      annotation_count: 0,
      id: r.id,
      table: "locations" as const,
      uploader: r.Contact?.name ?? null,
      uploader_type: "contact" as const,
      farm: r.Farm?.Farm_Name ?? null,
      farm_id: r.farm_id ?? null,
      media_type: "location",
      date_collected: r.start_time?.toISOString() ?? null,
      received_at: r.received_at.toISOString(),
      status: r.status,
      stage: r.stage ?? null,
      category: r.category ?? null,
      description: r.description ?? null,
      project_id: r.project_id ?? null,
      project_name: r.Project?.Project_Name ?? null,
      filename: null,
      content: r.name ?? null,
      latitude: null,
      longitude: null,
      gps_track: null,
      merge_group_id: r.merge_group_id ?? null,
      end_time: null,
    })),
    ...labUploads.map((r) => ({
      annotation_count: annCountMap.get(`lab-member-uploads-${r.id}`) ?? 0,
      id: r.id,
      table: "lab-member-uploads" as const,
      uploader: r.User?.name ?? null,
      uploader_type: "lab_member" as const,
      farm: r.Farm?.Farm_Name ?? null,
      farm_id: r.farm_id ?? null,
      media_type: r.media_type,
      date_collected: r.date_collected?.toISOString() ?? null,
      received_at: r.received_at.toISOString(),
      status: r.status,
      stage: r.stage ?? null,
      category: r.category ?? null,
      description: r.description ?? null,
      project_id: r.project_id ?? null,
      project_name: r.Project?.Project_Name ?? null,
      filename: r.filename ?? null,
      content: r.content ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      gps_track: null,
      merge_group_id: r.merge_group_id ?? null,
      end_time: r.end_time?.toISOString() ?? null,
    })),
  ].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());

  const projectList = projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project ${p.id}` }));
  const farmList = farms.map((f) => ({ id: f.id, name: f.Farm_Name ?? `Farm ${f.id}` }));

  return (
    <DataSortingClient
      items={items}
      projects={projectList}
      farms={farmList}
      canDelete={showDelete}
      activeFilter={activeFilter}
    />
  );
}
