"use client";

import { useRouter } from "next/navigation";
import { TestForm } from "@/components/forms/test-form";
import Link from "next/link";

export default function NewTestPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/tests" className="hover:text-slate-900">Tests</Link>
          <span>/</span>
          <span>New Test</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Test</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TestForm onSuccess={() => router.push("/tests")} />
      </div>
    </div>
  );
}
