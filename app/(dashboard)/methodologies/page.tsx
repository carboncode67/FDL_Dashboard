import { prisma } from "@/lib/prisma";
import { MethodologiesClient } from "./methodologies-client";

export default async function MethodologiesPage() {
  const methodologies = await prisma.methodology.findMany({
    orderBy: { title: "asc" },
    include: { _count: { select: { Tests: true } } },
  });

  return (
    <MethodologiesClient
      data={methodologies.map((m) => ({
        id: m.id,
        title: m.title,
        body: m.body,
        usageCount: m._count.Tests,
      }))}
    />
  );
}
