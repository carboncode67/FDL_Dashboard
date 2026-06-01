"use client";

import { useRouter } from "next/navigation";
import { FieldForm } from "@/components/forms/field-form";
import Link from "next/link";

export default function NewFieldPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/fields" className="hover:text-slate-900">Fields</Link>
          <span>/</span>
          <span>New Field</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Field</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <FieldForm onSuccess={() => router.push("/fields")} />
      </div>
    </div>
  );
}
