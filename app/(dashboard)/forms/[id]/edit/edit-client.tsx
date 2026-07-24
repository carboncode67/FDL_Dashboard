"use client";

import { useRouter } from "next/navigation";
import { FormBasicsForm } from "@/components/forms/form-basics-form";
import { FormSchemaBuilder } from "@/components/form-schema-builder";
import { FormAssignmentPicker } from "@/components/form-assignment-picker";
import Link from "next/link";

type Column = {
  col_index: number;
  field_type: "text" | "number" | "boolean" | "date" | "select" | "photo";
  label: string;
  required: boolean;
  options: string[] | null;
};

type Assignment = {
  id: number;
  contact_id: number | null;
  user_id: string | null;
  farm_id: number | null;
  farm_experiment_id: number | null;
  target_label: string;
};

interface Props {
  form: { id: number; title: string; description: string | null; is_active: boolean };
  fieldDefs: Column[];
  assignments: Assignment[];
  contacts: { id: number; name: string }[];
  users: { id: string; name: string | null; email: string }[];
  farms: { id: number; Farm_Name: string | null }[];
  experiments: { id: number; experiment_name: string | null }[];
}

export default function EditFormClient({ form, fieldDefs, assignments, contacts, users, farms, experiments }: Props) {
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/forms" className="hover:text-slate-900">Custom Forms</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {form.title}</h2>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <FormBasicsForm formId={form.id} initialData={form} onSuccess={() => router.refresh()} />
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Fields</h3>
        <FormSchemaBuilder formId={form.id} initialColumns={fieldDefs} />
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Assigned To</h3>
        <FormAssignmentPicker
          formId={form.id}
          initialAssignments={assignments}
          contacts={contacts}
          users={users}
          farms={farms}
          experiments={experiments}
        />
      </div>

      <div className="bg-white border rounded-lg p-6">
        <Link href={`/forms/${form.id}/responses`} className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
          View Responses →
        </Link>
      </div>
    </div>
  );
}
