import { prisma } from "@/lib/prisma";
import { geojsonAreaAcres } from "@/lib/geo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FolderKanban,
  Building2,
  Map,
  Layers,
  TestTube,
  FlaskConical,
  ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

async function getDashboardData() {
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    projectCount,
    projectsByStatus,
    farmCount,
    allZones,
    allFields,
    upcomingTestCount,
    upcomingTests,
    projects,
    recentExperiments,
    upcomingTasks,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.groupBy({
      by: ["Status"],
      _count: { id: true },
    }),
    prisma.farm.count(),
    prisma.experimentZone.findMany({
      select: { geometry: true, project_id: true },
    }),
    prisma.field.findMany({
      select: { geometry: true },
    }),
    prisma.test.count({
      where: {
        Planned_Date: {
          gte: now,
          lte: thirtyDaysLater,
        },
      },
    }),
    prisma.test.findMany({
      where: {
        Planned_Date: { not: null },
      },
      orderBy: { Planned_Date: "asc" },
      take: 10,
      include: {
        FieldTests: true,
      },
    }),
    prisma.project.findMany({
      select: { id: true, Project_Name: true, title: true },
      orderBy: { id: "asc" },
    }),
    prisma.farmExperiment.findMany({
      orderBy: { updated_at: "desc" },
      take: 5,
      select: {
        id: true,
        experiment_name: true,
        updated_at: true,
        farm_id: true,
        Farm: { select: { Farm_Name: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        due_date: { not: null },
        status: { not: "complete" },
      },
      orderBy: { due_date: "asc" },
      take: 10,
      include: {
        Experiment: {
          select: {
            id: true,
            experiment_name: true,
            farm_id: true,
            Farm: { select: { Farm_Name: true } },
          },
        },
        Assignees: {
          include: { User: { select: { id: true, name: true } } },
        },
      },
    }),
  ]);

  const activeProjects = projectsByStatus.find((p) => p.Status === "Active")?._count.id ?? 0;
  const zoneCount = allZones.length;

  // Compute total area across all zones that have geometry
  const totalAcres = allZones.reduce(
    (sum, z) => sum + geojsonAreaAcres(z.geometry),
    0
  );

  const totalFieldAcres = allFields.reduce(
    (sum, f) => sum + geojsonAreaAcres(f.geometry),
    0
  );

  // Per-project stats
  const projectMap: Record<number, { id: number; name: string; zoneCount: number; totalAcres: number }> = {};
  for (const p of projects) {
    projectMap[p.id] = {
      id: p.id,
      name: p.Project_Name ?? p.title ?? `Project #${p.id}`,
      zoneCount: 0,
      totalAcres: 0,
    };
  }
  for (const z of allZones) {
    if (z.project_id != null && projectMap[z.project_id]) {
      projectMap[z.project_id].zoneCount += 1;
      projectMap[z.project_id].totalAcres += geojsonAreaAcres(z.geometry);
    }
  }
  const projectStats = Object.values(projectMap).filter((p) => p.zoneCount > 0);

  return {
    projectCount,
    projectsByStatus,
    activeProjects,
    farmCount,
    zoneCount,
    totalAcres,
    totalFieldAcres,
    projectStats,
    upcomingTestCount,
    upcomingTests,
    recentExperiments,
    upcomingTasks,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const statusColors: Record<string, string> = {
    Active: "default",
    Completed: "secondary",
    Pending: "outline",
    Inactive: "outline",
  };

  const hasArea = data.totalAcres > 0;
  const hasFieldArea = data.totalFieldAcres > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 mt-1">Overview of all field operations</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.activeProjects}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {data.projectsByStatus.map((s) => (
                <Badge
                  key={s.Status ?? "unknown"}
                  variant={(statusColors[s.Status ?? ""] as "default" | "secondary" | "outline") ?? "outline"}
                  className="text-xs"
                >
                  {s.Status ?? "Unknown"}: {s._count.id}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Enrolled Farms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.farmCount}</div>
            <p className="text-xs text-slate-400 mt-2">Total registered farms</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Map className="h-4 w-4" />
              Enrolled Area
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasFieldArea ? (
              <>
                <div className="text-3xl font-bold">{data.totalFieldAcres.toFixed(1)}</div>
                <p className="text-xs text-slate-400 mt-2">Acres across all farm fields</p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-slate-400">—</div>
                <p className="text-xs text-slate-400 mt-2">No field boundaries uploaded yet</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Experiment Zones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.zoneCount}</div>
            <p className="text-xs text-slate-400 mt-2">Total defined zones</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Upcoming Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.upcomingTestCount}</div>
            <p className="text-xs text-slate-400 mt-2">Next 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Project Stats Table */}
      {data.projectStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Zone Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Zones</TableHead>
                  <TableHead className="text-right">Total Area (ac)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.projectStats.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{p.zoneCount}</TableCell>
                    <TableCell className="text-right">
                      {p.totalAcres > 0 ? p.totalAcres.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Experiments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-slate-500" />
            Recent Experiments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentExperiments.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No experiments yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Experiment Name</TableHead>
                  <TableHead>Farm</TableHead>
                  <TableHead>Last Edited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentExperiments.map((exp) => (
                  <TableRow key={exp.id} className="hover:bg-slate-50">
                    <TableCell className="font-medium">
                      <Link
                        href={`/farms/${exp.farm_id}/experiments/${exp.id}`}
                        className="hover:underline text-blue-600"
                      >
                        {exp.experiment_name ?? `Experiment #${exp.id}`}
                      </Link>
                    </TableCell>
                    <TableCell>{exp.Farm?.Farm_Name ?? "—"}</TableCell>
                    <TableCell className="text-slate-500">
                      {format(new Date(exp.updated_at), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Tests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming Tests</CardTitle>
        </CardHeader>
        <CardContent>
          {data.upcomingTests.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No upcoming tests scheduled</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Planned Date</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.upcomingTests.map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="font-medium">
                      {test.Test_Name ?? test.title ?? `Test #${test.id}`}
                    </TableCell>
                    <TableCell>{test.FieldTests.length}</TableCell>
                    <TableCell>
                      {test.Planned_Date
                        ? format(new Date(test.Planned_Date), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {test.Cost ? `$${Number(test.Cost).toLocaleString()}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Tasks Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-500" />
            Upcoming Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.upcomingTasks.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No upcoming tasks</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Experiment / Farm</TableHead>
                  <TableHead>Assigned To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.upcomingTasks.map((task) => {
                  const isUrgent = task.due_date != null && new Date(task.due_date) <= sevenDaysFromNow;
                  const priorityVariant: Record<string, "destructive" | "default" | "secondary"> = {
                    high: "destructive",
                    medium: "default",
                    low: "secondary",
                  };
                  const assigneeNames = task.Assignees.map((a) => a.User.name ?? a.User.id).join(", ");
                  return (
                    <TableRow key={task.id}>
                      <TableCell className={isUrgent ? "text-amber-600 font-medium" : "text-slate-500"}>
                        {task.due_date ? format(new Date(task.due_date), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/tasks/${task.id}`} className="hover:underline text-blue-600">
                          {task.description}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {task.classification ? (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {task.classification}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={priorityVariant[task.priority] ?? "secondary"} className="text-xs capitalize">
                          {task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {task.Experiment ? (
                          <Link
                            href={`/farms/${task.Experiment.farm_id}/experiments/${task.Experiment.id}`}
                            className="hover:underline text-blue-600 text-sm"
                          >
                            {task.Experiment.experiment_name ?? `Experiment #${task.Experiment.id}`}
                            {task.Experiment.Farm?.Farm_Name ? ` · ${task.Experiment.Farm.Farm_Name}` : ""}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {assigneeNames || "Unassigned"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
