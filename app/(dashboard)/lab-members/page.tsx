import { prisma } from "@/lib/prisma";
import { LabMembersClient } from "./lab-members-client";

export default async function LabMembersPage() {
  const members = await prisma.labMember.findMany({ orderBy: { id: "asc" } });
  const data = members.map((m) => ({
    id: m.id,
    Name: m.Name,
    Position: m.Position,
    Status: m.Status,
    FAA_Part_107: m.FAA_Part_107 ?? false,
    Contact_Phone: m.Contact_Phone,
    Contact_Email: m.Contact_Email,
    has_token: !!m.token,
  }));
  return <LabMembersClient data={data} />;
}
