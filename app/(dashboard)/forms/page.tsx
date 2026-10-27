import { prisma } from "@/lib/prisma";
import { FormsClient } from "./forms-client";
import { runWithTenant } from "@/lib/lab-db";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { listItemGroups } from "@/lib/item-groups";

export default async function FormsPage() {
  return runWithTenant(async () => {
  const [session, forms, groups] = await Promise.all([
    auth(),
    prisma.form.findMany({
      include: { _count: { select: { FieldDefinitions: { where: { archived_at: null } }, Assignments: true, Responses: true } } },
      orderBy: { created_at: "desc" },
    }),
    listItemGroups("forms"),
  ]);
  const role = (session?.user?.role ?? "viewer") as Role;

  const data = forms.map((f) => ({
    id: f.id,
    title: f.title,
    group_id: f.group_id,
    is_active: f.is_active,
    field_count: f._count.FieldDefinitions,
    assignment_count: f._count.Assignments,
    response_count: f._count.Responses,
  }));

  return <FormsClient data={data} groups={groups} canEditGroups={canEdit(role)} />;
  });
}
