import { prisma } from "@/lib/prisma";
import { FormsClient } from "./forms-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function FormsPage() {
  return runWithTenant(async () => {
  const forms = await prisma.form.findMany({
    include: { _count: { select: { FieldDefinitions: true, Assignments: true, Responses: true } } },
    orderBy: { created_at: "desc" },
  });

  const data = forms.map((f) => ({
    id: f.id,
    title: f.title,
    is_active: f.is_active,
    field_count: f._count.FieldDefinitions,
    assignment_count: f._count.Assignments,
    response_count: f._count.Responses,
  }));

  return <FormsClient data={data} />;
  });
}
