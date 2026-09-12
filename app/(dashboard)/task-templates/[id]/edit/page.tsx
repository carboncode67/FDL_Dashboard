import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditTaskTemplateClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditTaskTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const template = await prisma.taskTemplate.findUnique({ where: { id: parseInt(id) } });
  if (!template) notFound();
  return (
    <EditTaskTemplateClient
      template={{
        id:             template.id,
        description:    template.description,
        classification: template.classification,
        priority:       template.priority,
      }}
    />
  );
  });
}
