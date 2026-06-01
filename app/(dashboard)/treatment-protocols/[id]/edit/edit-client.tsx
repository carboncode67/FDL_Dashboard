"use client";

import { useRouter } from "next/navigation";
import { TreatmentProtocolForm } from "@/components/forms/treatment-protocol-form";
import Link from "next/link";

interface Props {
  protocol: { id: number; Protocol_Name: string | null; Product: string | null; Rate: number | null; Rate_Unit: string | null; Timing: string | null; Notes: string | null };
}

export default function EditProtocolClient({ protocol }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/treatment-protocols" className="hover:text-slate-900">Treatment Protocols</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {protocol.Protocol_Name ?? `Protocol #${protocol.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TreatmentProtocolForm protocolId={protocol.id} initialData={protocol} onSuccess={() => router.push("/treatment-protocols")} />
      </div>
    </div>
  );
}
