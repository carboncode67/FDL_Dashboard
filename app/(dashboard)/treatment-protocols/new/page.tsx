"use client";

import { useRouter } from "next/navigation";
import { TreatmentProtocolForm } from "@/components/forms/treatment-protocol-form";
import Link from "next/link";

export default function NewTreatmentProtocolPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
          <Link href="/treatment-protocols" className="hover:text-stone-900">Treatment Protocols</Link>
          <span>/</span>
          <span>New Protocol</span>
        </div>
        <h2 className="text-2xl font-bold text-stone-900">New Treatment Protocol</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TreatmentProtocolForm onSuccess={() => router.push("/treatment-protocols")} />
      </div>
    </div>
  );
}
