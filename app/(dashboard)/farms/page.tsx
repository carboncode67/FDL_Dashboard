import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { getEffectiveScope } from "@/lib/get-user-filters";
import { FarmsClient } from "./farms-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function FarmsPage() {
  return runWithTenant(async () => {
  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;
  const userId = session?.user?.id ?? null;

  const { farmIds, tagFiltered } = await getEffectiveScope(userId, session?.user?.category);

  const farmWhere = farmIds.length > 0 ? { id: { in: farmIds } } : {};

  const farms = await prisma.farm.findMany({
    where: farmWhere,
    orderBy: { Farm_Name: "asc" },
    include: {
      Contacts: { where: { is_lab_member: false }, orderBy: { id: "asc" }, take: 1 },
      TagLinks: { include: { Tag: { select: { id: true, name: true } } } },
    },
  });

  // Counted from the result, not farmIds — a tag filter matching nothing leaves farmIds as
  // the [-1] sentinel, which would otherwise read as "1 farm".
  const activeFilter = farmIds.length > 0 ? { projectCount: 0, farmCount: farms.length, tagFiltered } : null;

  const data = farms.map((f) => ({
    id: f.id,
    Farm_Name: f.Farm_Name,
    Farmer_Name: f.Contacts[0]?.name ?? null,
    tags: f.TagLinks.map((l) => l.Tag).sort((a, b) => a.name.localeCompare(b.name)),
    // Plain string copy so the table's search box also matches tag names.
    tag_names: f.TagLinks.map((l) => l.Tag.name).join(" "),
    is_active: f.is_active,
    created_at: f.created_at ? f.created_at.toISOString() : null,
    updated_at: f.updated_at ? f.updated_at.toISOString() : null,
  }));

  return (
    <FarmsClient
      data={data}
      canCreate={canCreate(role)}
      canRenameTags={canEdit(role)}
      canDeleteTags={canDelete(role, editMode)}
      activeFilter={activeFilter}
    />
  );
  });
}
