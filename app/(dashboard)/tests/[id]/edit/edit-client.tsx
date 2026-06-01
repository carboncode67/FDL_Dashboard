"use client";

import { useRouter } from "next/navigation";
import { TestForm } from "@/components/forms/test-form";
import Link from "next/link";

interface Props {
  test: { id: number; Test_Name: string | null; Test_Description: string | null; Cost: number | null; Planned_Date: string | null; N_Samples: number | null };
}

export default function EditTestClient({ test }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/tests" className="hover:text-slate-900">Tests</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {test.Test_Name ?? `Test #${test.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TestForm testId={test.id} initialData={test} onSuccess={() => router.push("/tests")} />
      </div>
    </div>
  );
}
