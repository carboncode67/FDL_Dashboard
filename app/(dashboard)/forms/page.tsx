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

  const rows = forms.map((f) => ({
    id: f.id,
    title: f.title,
    group_id: f.group_id,
    is_active: f.is_active,
    field_count: f._count.FieldDefinitions,
    assignment_count: f._count.Assignments,
    response_count: f._count.Responses,
    fromOfe: f.ofe_id != null,
  }));
  // OFE-owned forms (pushed by OFE_Dashboard, read-only here — lib/ofe-sync.ts) get their own table.
  const data = rows.filter((r) => !r.fromOfe);
  const ofeData = rows.filter((r) => r.fromOfe);

  return <FormsClient data={data} ofeData={ofeData} groups={groups} canEditGroups={canEdit(role)} />;
  });
}
