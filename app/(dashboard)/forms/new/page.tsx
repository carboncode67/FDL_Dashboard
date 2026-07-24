"use client";

import { useRouter } from "next/navigation";
import { FormBasicsForm } from "@/components/forms/form-basics-form";
import Link from "next/link";

export default function NewFormPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/forms" className="hover:text-slate-900">Custom Forms</Link>
          <span>/</span>
          <span>New Form</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Form</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <FormBasicsForm onSuccess={(form) => router.push(`/forms/${form.id}/edit`)} />
      </div>
    </div>
  );
}
