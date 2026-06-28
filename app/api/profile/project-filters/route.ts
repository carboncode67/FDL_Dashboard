import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [projectFilters, farmFilters, settings, allFarms] = await Promise.all([
    prisma.userProjectFilter.findMany({ where: { user_id: userId }, select: { project_id: true } }),
    prisma.userFarmFilter.findMany({ where: { user_id: userId }, select: { farm_id: true } }),
    prisma.userFilterSettings.findUnique({ where: { user_id: userId }, select: { show_unassigned: true } }),
    prisma.farm.findMany({
      select: {
        id: true,
        Farm_Name: true,
        ProjectFarms: { select: { Projects_id: true } },
      },
      orderBy: { Farm_Name: "asc" },
    }),
  ]);

  const farm_options = allFarms.map((f) => ({
    id: f.id,
    name: f.Farm_Name ?? `Farm ${f.id}`,
    project_ids: f.ProjectFarms.map((pf) => pf.Projects_id),
  }));

  // Also derive project list from farms (for the project checkboxes in the dialog)
  const projectIdsFromFarms = new Set(farm_options.flatMap((f) => f.project_ids));
  const projects = await prisma.project.findMany({
    select: { id: true, Project_Name: true },
    orderBy: { Project_Name: "asc" },
  });

  return NextResponse.json({
    project_ids: projectFilters.map((f) => f.project_id),
    farm_ids: farmFilters.map((f) => f.farm_id),
    show_unassigned: settings?.show_unassigned ?? true,
    projects: projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project ${p.id}` })),
    farm_options,
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const project_ids: number[] = Array.isArray(body.project_ids) ? body.project_ids : [];
  const farm_ids: number[] = Array.isArray(body.farm_ids) ? body.farm_ids : [];
  const show_unassigned: boolean = body.show_unassigned !== false;

  await prisma.$transaction([
    prisma.userProjectFilter.deleteMany({ where: { user_id: userId } }),
    prisma.userFarmFilter.deleteMany({ where: { user_id: userId } }),
    ...(project_ids.length > 0
      ? [prisma.userProjectFilter.createMany({
          data: project_ids.map((pid) => ({ user_id: userId, project_id: pid })),
          skipDuplicates: true,
        })]
      : []),
    ...(farm_ids.length > 0
      ? [prisma.userFarmFilter.createMany({
          data: farm_ids.map((fid) => ({ user_id: userId, farm_id: fid })),
          skipDuplicates: true,
        })]
      : []),
    prisma.userFilterSettings.upsert({
      where: { user_id: userId },
      create: { user_id: userId, show_unassigned },
      update: { show_unassigned },
    }),
  ]);

  return NextResponse.json({ project_ids, farm_ids, show_unassigned });
}
