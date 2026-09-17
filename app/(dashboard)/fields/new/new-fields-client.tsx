"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { MultiFieldForm, type FarmOption } from "@/components/forms/multi-field-form";

export function NewFieldsClient({
  farms,
  defaultFarmId,
}: {
  farms: FarmOption[];
  defaultFarmId?: number;
}) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
          <Link href="/fields" className="hover:text-stone-900">Fields</Link>
          <span>/</span>
          <span>New Field</span>
        </div>
        <h2 className="text-2xl font-bold text-stone-900">New Field</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <MultiFieldForm farms={farms} defaultFarmId={defaultFarmId} onSuccess={() => router.push("/fields")} />
      </div>
    </div>
  );
}
