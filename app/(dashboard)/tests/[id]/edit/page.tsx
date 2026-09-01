import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditTestClient from "./edit-client";

export default async function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const testId = parseInt(id);
  const [test, documents] = await Promise.all([
    prisma.test.findUnique({
      where: { id: testId },
      include: {
        TaskTemplates: true,
        RequiredEquipment: true,
        DataTables: { include: { _count: { select: { FieldDefinitions: true } } } },
        UsedDataTables: { include: { DataTable: { include: { _count: { select: { FieldDefinitions: true } } } } } },
      },
    }),
    prisma.document.findMany({ where: { test_id: testId }, orderBy: { uploaded_at: "desc" } }),
  ]);
  if (!test) notFound();

  const dataSources = [
    ...test.DataTables.map((t) => ({ id: t.id, name: t.name, columnCount: t._count.FieldDefinitions, home: true as const })),
    ...test.UsedDataTables.map((u) => ({ id: u.DataTable.id, name: u.DataTable.name, columnCount: u.DataTable._count.FieldDefinitions, home: false as const })),
  ];

  return (
    <EditTestClient
      test={{
        id: test.id,
        Test_Name: test.Test_Name,
        Test_Description: test.Test_Description,
        Cost: test.Cost ? Number(test.Cost) : null,
        Methodology: test.Methodology,
        methodology_id: test.methodology_id,
        TaskTemplates: test.TaskTemplates.map((t) => ({
          description:    t.description,
          classification: t.classification,
          priority:       t.priority,
        })),
        RequiredEquipment: test.RequiredEquipment.map((e) => ({ Drones_id: e.Drones_id })),
        UsedDataTables: test.UsedDataTables.map((u) => ({ Tables_id: u.Tables_id })),
      }}
      dataSources={dataSources}
      documents={documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        original_name: d.original_name,
        file_type: d.file_type,
        file_size: d.file_size,
        description: d.description,
        uploaded_at: d.uploaded_at.toISOString(),
      }))}
    />
  );
}
