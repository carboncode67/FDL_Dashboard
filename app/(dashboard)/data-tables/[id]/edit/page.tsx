import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditDataTableClient from "./edit-client";

export default async function EditDataTablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataTableId = parseInt(id);
  const [table, fieldDefs] = await Promise.all([
    prisma.dataTable.findUnique({
      where: { id: dataTableId },
      include: {
        HomeTest: { select: { id: true, Test_Name: true } },
        HomeDrone: { select: { id: true, Name: true } },
        UsedByTests: { include: { Test: { select: { id: true, Test_Name: true } } } },
      },
    }),
    prisma.dataTableFieldDefinition.findMany({ where: { data_table_id: dataTableId }, orderBy: { col_index: "asc" } }),
  ]);
  if (!table) notFound();

  return (
    <EditDataTableClient
      table={{
        id: table.id,
        name: table.name,
        description: table.description,
        data_processing_instructions: table.data_processing_instructions,
        test_id: table.test_id,
        drone_id: table.drone_id,
      }}
      homeLabel={
        table.HomeTest
          ? `Test: ${table.HomeTest.Test_Name ?? `#${table.HomeTest.id}`}`
          : table.HomeDrone
          ? `Equipment: ${table.HomeDrone.Name ?? `#${table.HomeDrone.id}`}`
          : null
      }
      usedByTests={table.UsedByTests.map((u) => u.Test.Test_Name ?? `Test #${u.Test.id}`)}
      fieldDefs={fieldDefs.map((d) => ({ col_index: d.col_index, field_type: d.field_type as "text" | "number", label: d.label }))}
    />
  );
}
