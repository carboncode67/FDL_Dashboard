import { prisma } from "@/lib/prisma";

export interface UserFilters {
  projectIds: number[];
  farmIds: number[];
  showUnassigned: boolean;
}

export async function getUserFilters(userId: string | null): Promise<UserFilters> {
  if (!userId) return { projectIds: [], farmIds: [], showUnassigned: true };

  const [projects, farms, settings] = await Promise.all([
    prisma.userProjectFilter.findMany({ where: { user_id: userId }, select: { project_id: true } }),
    prisma.userFarmFilter.findMany({ where: { user_id: userId }, select: { farm_id: true } }),
    prisma.userFilterSettings.findUnique({ where: { user_id: userId }, select: { show_unassigned: true } }),
  ]);

  return {
    projectIds: projects.map((p) => p.project_id),
    farmIds: farms.map((f) => f.farm_id),
    showUnassigned: settings?.show_unassigned ?? true,
  };
}
