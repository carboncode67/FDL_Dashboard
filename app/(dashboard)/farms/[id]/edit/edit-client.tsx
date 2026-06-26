"use client";

import { useRouter } from "next/navigation";
import { FarmForm } from "@/components/forms/farm-form";
import Link from "next/link";

interface Props {
  farm: {
    id: number;
    Farm_Name: string | null;
    farm_summary: string | null;
    is_active: boolean;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
}

export default function EditFarmClient({ farm }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/farms" className="hover:text-slate-900">Farms</Link>
          <span>/</span>
          <Link href={`/farms/${farm.id}`} className="hover:text-slate-900">
            {farm.Farm_Name ?? `Farm #${farm.id}`}
          </Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit Farm</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <FarmForm
          farmId={farm.id}
          initialData={farm}
          onSuccess={() => router.push(`/farms/${farm.id}`)}
        />
      </div>
    </div>
  );
}
