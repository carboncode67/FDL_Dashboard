import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canDelete, type Role } from "@/lib/roles";
import { DataSortingClient, UploadItem } from "./data-sorting-client";

export default async function DataSortingPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Fetch user's project filter before the main query so we can apply it
  const userFilterRecords = userId
    ? await prisma.userProjectFilter.findMany({
        where: { user_id: userId },
        select: { project_id: true },
      })
    : [];
  const filterIds = userFilterRecords.map((f) => f.project_id);
  const projectWhere = filterIds.length > 0 ? { project_id: { in: filterIds } } : undefined;

  const [photos, notes, recordings, locations, labUploads, projects, farms, editMode, annotationCounts] = await Promise.all([
    prisma.photo.findMany({
      where: projectWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.note.findMany({
      where: projectWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.recording.findMany({
      where: projectWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.location.findMany({
      where: projectWhere,
      include: {
        Contact: { select: { name: true } },
        Farm:    { select: { Farm_Name: true } },
        Project: { select: { Project_Name: true } },
      },
      orderBy: { received_at: "desc" },
    }),
    prisma.labMemberUpload.findMany({
      where: projectWhere,
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
    getEditMode(),
    prisma.annotation.groupBy({ by: ["upload_id", "upload_table"], _count: { id: true } }),
  ]);

  const role = (session?.user?.role ?? "viewer") as Role;

  // Build active filter info for the banner
  const activeProjectFilter = filterIds.length > 0
    ? {
        count: filterIds.length,
        names: projects
          .filter((p) => filterIds.includes(p.id))
          .map((p) => p.Project_Name ?? `Project ${p.id}`),
      }
    : undefined;
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
      activeProjectFilter={activeProjectFilter}
    />
  );
}
