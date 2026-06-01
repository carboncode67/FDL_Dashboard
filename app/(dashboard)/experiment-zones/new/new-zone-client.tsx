"use client";

import { useRouter } from "next/navigation";
import { ExperimentZoneForm } from "@/components/forms/experiment-zone-form";
import Link from "next/link";

interface Props {
  fields: { id: number; name: string }[];
}

export default function NewZoneClient({ fields }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/experiment-zones" className="hover:text-slate-900">Experiment Zones</Link>
          <span>/</span>
          <span>New Zone</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Experiment Zone</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <ExperimentZoneForm fields={fields} onSuccess={() => router.push("/experiment-zones")} />
      </div>
    </div>
  );
}
