"use client";

import { useRouter } from "next/navigation";
import { TestForm } from "@/components/forms/test-form";
import { TestSchemaBuilder } from "@/components/test-schema-builder";
import Link from "next/link";

type Column = { col_index: number; field_type: "text" | "number"; label: string };

interface Props {
  test: {
    id: number;
    Test_Name: string | null;
    Test_Description: string | null;
    Cost: number | null;
    Methodology: string | null;
    Data_Processing_Instructions: string | null;
  };
  fieldDefs: Column[];
}

export default function EditTestClient({ test, fieldDefs }: Props) {
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
      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Data Template</h3>
        <TestSchemaBuilder testId={test.id} initialColumns={fieldDefs} />
      </div>
    </div>
  );
}
