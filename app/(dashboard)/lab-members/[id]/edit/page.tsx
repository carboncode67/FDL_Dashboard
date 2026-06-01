import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditLabMemberClient from "./edit-client";

export default async function EditLabMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await prisma.labMember.findUnique({ where: { id: parseInt(id) } });
  if (!member) notFound();
  return (
    <EditLabMemberClient
      member={{
        id: member.id,
        Name: member.Name,
        Position: member.Position,
        Contact_Phone: member.Contact_Phone,
        Contact_Email: member.Contact_Email,
        Status: member.Status,
        FAA_Part_107: member.FAA_Part_107,
      }}
    />
  );
}
