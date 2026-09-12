import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditLabMemberClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditLabMemberPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  return (
    <EditLabMemberClient
      member={{
        id: user.id,
        name: user.name,
        position: user.position,
        contact_phone: user.contact_phone,
        email: user.email,
        status: user.status,
        faa_part_107: user.faa_part_107,
        category: user.category,
      }}
    />
  );
  });
}
