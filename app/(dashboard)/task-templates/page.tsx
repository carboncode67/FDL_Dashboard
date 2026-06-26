import { prisma } from "@/lib/prisma";
import { TaskTemplatesClient } from "./task-templates-client";

export default async function TaskTemplatesPage() {
  const templates = await prisma.taskTemplate.findMany({
    where: { test_id: null, drone_id: null },
    orderBy: { description: "asc" },
  });

  return (
    <TaskTemplatesClient
      data={templates.map((t) => ({
        id:             t.id,
        description:    t.description,
        classification: t.classification,
        priority:       t.priority,
      }))}
    />
  );
}
