import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, canEdit, type Role } from "@/lib/roles";
import { LabMembersClient } from "./lab-members-client";

export default async function LabMembersPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const data = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    position: u.position,
    status: u.status,
    faa_part_107: u.faa_part_107,
    contact_phone: u.contact_phone,
    role: u.role,
    has_token: !!u.bearer_token,
    onboarded_at: u.onboarded_at ? u.onboarded_at.toISOString() : null,
  }));
  return <LabMembersClient data={data} canCreate={canCreate(role)} canEdit={canEdit(role)} />;
}
