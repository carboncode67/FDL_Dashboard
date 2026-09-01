import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canCreate, canDelete, type Role } from "@/lib/roles";
import { DataCategoriesClient } from "./data-categories-client";

export default async function DataCategoriesPage() {
  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;

  const categories = await prisma.uploadCategory.findMany({
    orderBy: { sort_order: "asc" },
    include: { Metrics: { orderBy: { sort_order: "asc" } } },
  });

  return (
    <DataCategoriesClient
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        media_types: c.media_types,
        sort_order: c.sort_order,
        Metrics: c.Metrics.map((m) => ({
          id: m.id,
          label: m.label,
          field_type: m.field_type as "text" | "number" | "select" | "boolean",
          unit: m.unit,
          options: Array.isArray(m.options) ? (m.options as string[]) : null,
          sort_order: m.sort_order,
        })),
      }))}
      canEdit={canCreate(role)}
      canDeleteCategory={canDelete(role, editMode)}
    />
  );
}
