"use client";

import { useRouter } from "next/navigation";
import { TreatmentForm } from "@/components/forms/treatment-form";
import Link from "next/link";

export default function NewTreatmentPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/treatments" className="hover:text-slate-900">Treatments</Link>
          <span>/</span>
          <span>New Treatment</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Treatment</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TreatmentForm onSuccess={() => router.push("/treatments")} />
      </div>
    </div>
  );
}
