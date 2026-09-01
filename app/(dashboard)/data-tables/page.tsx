import { prisma } from "@/lib/prisma";
import { DataTablesClient } from "./data-tables-client";

export default async function DataTablesPage() {
  const tables = await prisma.dataTable.findMany({
    orderBy: { name: "asc" },
    include: {
      HomeTest: { select: { id: true, Test_Name: true } },
      HomeDrone: { select: { id: true, Name: true } },
      _count: { select: { UsedByTests: true, FieldDefinitions: true } },
    },
  });

  return (
    <DataTablesClient
      data={tables.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        homeLabel: t.HomeTest
          ? `Test: ${t.HomeTest.Test_Name ?? `#${t.HomeTest.id}`}`
          : t.HomeDrone
          ? `Equipment: ${t.HomeDrone.Name ?? `#${t.HomeDrone.id}`}`
          : "Shared library",
        columnCount: t._count.FieldDefinitions,
        usageCount: (t.test_id ? 1 : 0) + t._count.UsedByTests,
      }))}
    />
  );
}
