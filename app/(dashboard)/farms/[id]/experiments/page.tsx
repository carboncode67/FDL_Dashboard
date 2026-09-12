import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { runWithTenant } from "@/lib/lab-db";

export default async function FarmExperimentsListPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const farmId = parseInt(id);

  const [farm, experiments] = await Promise.all([
    prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, Farm_Name: true } }),
    prisma.farmExperiment.findMany({
      where: { farm_id: farmId },
      orderBy: { id: "asc" },
      include: { ExperimentFields: { select: { field_id: true } } },
    }),
  ]);

  if (!farm) notFound();
  const session = await auth();
  const scope = await getEffectiveScope(session?.user?.id ?? null, session?.user?.category);
  if (!scopeIncludesFarm(scope, farm.id)) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/farms" className="hover:text-slate-900">Farms</Link>
          <span>/</span>
          <Link href={`/farms/${farmId}`} className="hover:text-slate-900">
            {farm.Farm_Name ?? `Farm #${farmId}`}
          </Link>
          <span>/</span>
          <span>Experiments</span>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Experiments</h2>
          <Link
            href={`/farms/${farmId}/experiments/new`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Experiment
          </Link>
        </div>
      </div>

      {experiments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500 text-sm italic">
            No experiments yet.{" "}
            <Link href={`/farms/${farmId}/experiments/new`} className="text-blue-600 hover:underline">
              Add one
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">
                    {exp.experiment_name ?? `Experiment #${exp.id}`}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {exp.start_date
                      ? `Started ${new Date(exp.start_date).toLocaleDateString()}`
                      : "No start date"}{" "}
                    · {exp.ExperimentFields.length} field{exp.ExperimentFields.length !== 1 ? "s" : ""} linked
                  </p>
                </div>
                <Link
                  href={`/farms/${farmId}/experiments/${exp.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Edit
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
  });
}
