import { prisma } from "@/lib/prisma";
import { TestsClient } from "./tests-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function TestsPage() {
  return runWithTenant(async () => {
  const tests = await prisma.test.findMany({
    include: {
      ExperimentTests: {
        include: { Experiment: { include: { Farm: { select: { Farm_Name: true } } } } },
      },
    },
    orderBy: { Test_Name: "asc" },
  });

  const data = tests.map((t) => ({
    id: t.id,
    Test_Name: t.Test_Name,
    Cost: t.Cost ? Number(t.Cost) : null,
    assignments: t.ExperimentTests.map((et) => ({
      farm_name: et.Experiment?.Farm?.Farm_Name ?? null,
      status: et.status ?? null,
    })),
  }));

  return <TestsClient data={data} />;
  });
}
