"use client";

import { useRouter } from "next/navigation";
import { FieldForm } from "@/components/forms/field-form";
import Link from "next/link";

interface Props {
  field: {
    id: number;
    Name: string | null;
    boundary_source: string | null;
    Farms_id: number | null;
  };
}

export default function EditFieldClient({ field }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/fields" className="hover:text-slate-900">Fields</Link>
          <span>/</span>
          <Link href={`/fields/${field.id}`} className="hover:text-slate-900">
            {field.Name ?? `Field #${field.id}`}
          </Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit Field</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <FieldForm
          fieldId={field.id}
          initialData={field}
          onSuccess={() => router.push(`/fields/${field.id}`)}
        />
      </div>
    </div>
  );
}
