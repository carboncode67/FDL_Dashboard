import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditMethodologyClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditMethodologyPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const methodology = await prisma.methodology.findUnique({ where: { id: parseInt(id) } });
  if (!methodology) notFound();
  return (
    <EditMethodologyClient
      methodology={{
        id: methodology.id,
        title: methodology.title,
        body: methodology.body,
      }}
    />
  );
  });
}
