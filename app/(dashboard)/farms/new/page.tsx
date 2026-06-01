"use client";

import { useRouter } from "next/navigation";
import { FarmForm } from "@/components/forms/farm-form";
import Link from "next/link";

export default function NewFarmPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/farms" className="hover:text-slate-900">Farms</Link>
          <span>/</span>
          <span>New Farm</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Farm</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <FarmForm onSuccess={() => router.push("/farms")} />
      </div>
    </div>
  );
}
