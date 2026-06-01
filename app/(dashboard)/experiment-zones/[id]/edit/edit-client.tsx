"use client";

import { useRouter } from "next/navigation";
import { ExperimentZoneForm } from "@/components/forms/experiment-zone-form";
import Link from "next/link";

interface Props {
  zone: { id: number; Zone_Label: string | null; Rep_Number: number | null; Fields_id: number | null };
  fields: { id: number; name: string }[];
}

export default function EditZoneClient({ zone, fields }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/experiment-zones" className="hover:text-slate-900">Experiment Zones</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {zone.Zone_Label ?? `Zone #${zone.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <ExperimentZoneForm
          zoneId={zone.id}
          initialData={zone}
          fields={fields}
          onSuccess={() => router.push("/experiment-zones")}
        />
      </div>
    </div>
  );
}
