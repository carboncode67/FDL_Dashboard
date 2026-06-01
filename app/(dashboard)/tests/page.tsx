import { prisma } from "@/lib/prisma";
import { TestsClient } from "./tests-client";
import { format } from "date-fns";

export default async function TestsPage() {
  const tests = await prisma.test.findMany({ orderBy: { Planned_Date: "asc" } });
  const data = tests.map((t) => ({
    id: t.id,
    Test_Name: t.Test_Name,
    Planned_Date: t.Planned_Date ? format(new Date(t.Planned_Date), "MMM d, yyyy") : null,
    Completed_Date: t.Completed_Date ? format(new Date(t.Completed_Date), "MMM d, yyyy") : null,
    Cost: t.Cost ? Number(t.Cost) : null,
    N_Samples: t.N_Samples,
  }));
  return <TestsClient data={data} />;
}
