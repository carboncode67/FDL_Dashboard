import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditTestClient from "./edit-client";

export default async function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const testId = parseInt(id);
  const [test, fieldDefs] = await Promise.all([
    prisma.test.findUnique({ where: { id: testId } }),
    prisma.testFieldDefinition.findMany({ where: { test_id: testId }, orderBy: { col_index: "asc" } }),
  ]);
  if (!test) notFound();
  return (
    <EditTestClient
      test={{
        id: test.id,
        Test_Name: test.Test_Name,
        Test_Description: test.Test_Description,
        Cost: test.Cost ? Number(test.Cost) : null,
        Methodology: test.Methodology,
        Data_Processing_Instructions: test.Data_Processing_Instructions,
      }}
      fieldDefs={fieldDefs.map((d) => ({ col_index: d.col_index, field_type: d.field_type as "text" | "number", label: d.label }))}
    />
  );
}
