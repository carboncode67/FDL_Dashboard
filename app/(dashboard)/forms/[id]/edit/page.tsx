import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ASSIGNMENT_INCLUDE, resolveTargetLabel } from "@/lib/forms";
import EditFormClient from "./edit-client";

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formId = parseInt(id);

  const [form, fieldDefs, assignments, contacts, users, farms, experiments] = await Promise.all([
    prisma.form.findUnique({ where: { id: formId } }),
    prisma.formFieldDefinition.findMany({ where: { form_id: formId }, orderBy: { col_index: "asc" } }),
    prisma.formAssignment.findMany({
      where: { form_id: formId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { created_at: "asc" },
    }),
    prisma.contact.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.farm.findMany({ select: { id: true, Farm_Name: true }, orderBy: { Farm_Name: "asc" } }),
    prisma.farmExperiment.findMany({ select: { id: true, experiment_name: true }, orderBy: { experiment_name: "asc" } }),
  ]);

  if (!form) notFound();

  return (
    <EditFormClient
      form={{ id: form.id, title: form.title, description: form.description, is_active: form.is_active }}
      fieldDefs={fieldDefs.map((d) => ({
        col_index: d.col_index,
        field_type: d.field_type as "text" | "number" | "boolean" | "date" | "select" | "photo",
        label: d.label,
        required: d.required,
        options: (d.options as string[] | null) ?? null,
      }))}
      assignments={assignments.map((a) => ({
        id: a.id,
        contact_id: a.contact_id,
        user_id: a.user_id,
        farm_id: a.farm_id,
        farm_experiment_id: a.farm_experiment_id,
        target_label: resolveTargetLabel(a),
      }))}
      contacts={contacts}
      users={users}
      farms={farms}
      experiments={experiments}
    />
  );
}
