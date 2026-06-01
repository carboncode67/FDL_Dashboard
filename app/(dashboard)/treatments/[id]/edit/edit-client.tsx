"use client";

import { useRouter } from "next/navigation";
import { TreatmentForm } from "@/components/forms/treatment-form";
import Link from "next/link";

interface Props {
  treatment: { id: number; Treatment_Name: string | null; Description: string | null; Notes: string | null };
}

export default function EditTreatmentClient({ treatment }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/treatments" className="hover:text-slate-900">Treatments</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {treatment.Treatment_Name ?? `Treatment #${treatment.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TreatmentForm treatmentId={treatment.id} initialData={treatment} onSuccess={() => router.push("/treatments")} />
      </div>
    </div>
  );
}
