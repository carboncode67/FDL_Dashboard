"use client";

import { useState } from "react";
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
  show_when_label: string | null;
  show_when_value: string | null;
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
  responseCount: number;
  canDelete: boolean;
}

export default function EditFormClient({ form, fieldDefs, assignments, contacts, users, farms, experiments, responseCount, canDelete }: Props) {
  const router = useRouter();
  const [exported, setExported] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsExport = responseCount > 0;

  async function handleDelete() {
    const extra = needsExport ? ` and its ${responseCount} response(s)` : "";
    if (!confirm(`Permanently delete "${form.title}"${extra}? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/forms/${form.id}${needsExport ? "?confirm_exported=true" : ""}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/forms");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? "Could not delete the form.");
    setDeleting(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
          <Link href="/forms" className="hover:text-stone-900">Custom Forms</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-stone-900">Edit {form.title}</h2>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <FormBasicsForm formId={form.id} initialData={form} onSuccess={() => router.refresh()} />
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-stone-900 pb-2 border-b">Fields</h3>
        <FormSchemaBuilder formId={form.id} initialColumns={fieldDefs} />
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-stone-900 pb-2 border-b">Assigned To</h3>
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
        <Link href={`/forms/${form.id}/responses`} className="text-sm font-medium text-green-700 hover:text-green-900">
          View Responses →
        </Link>
      </div>

      {canDelete && (
        <div className="bg-white border border-red-200 rounded-lg p-6 space-y-3">
          <h3 className="text-sm font-semibold text-red-700 pb-2 border-b border-red-100">Delete Form</h3>
          <p className="text-sm text-stone-600">
            Permanently removes this form, its fields, its assignments{needsExport ? ` and all ${responseCount} responses` : ""}.
            Devices stop seeing it on their next refresh.
          </p>
          {needsExport && (
            <p className="text-sm text-amber-700">
              This form has responses. Download the CSV export first — deletion is disabled until you do.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            {needsExport && (
              <a
                href={`/api/forms/${form.id}/export`}
                download
                onClick={() => setExported(true)}
                className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
              >
                Download CSV ({responseCount})
              </a>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || (needsExport && !exported)}
              className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting…" : "Delete Form"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
