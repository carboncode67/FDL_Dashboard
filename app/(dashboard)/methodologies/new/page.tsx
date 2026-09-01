"use client";

import { useRouter } from "next/navigation";
import { MethodologyForm } from "@/components/forms/methodology-form";
import Link from "next/link";

export default function NewMethodologyPage() {
  const router = useRouter();
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/methodologies" className="hover:text-slate-900">Methodologies</Link>
          <span>/</span>
          <span>New</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Methodology</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <MethodologyForm onSuccess={() => router.push("/methodologies")} />
      </div>
    </div>
  );
}
