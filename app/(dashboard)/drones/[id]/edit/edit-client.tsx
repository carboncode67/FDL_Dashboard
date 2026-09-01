"use client";

import { useRouter } from "next/navigation";
import { DroneForm } from "@/components/forms/drone-form";
import Link from "next/link";

interface Props {
  drone: {
    id: number;
    Name: string | null;
    Description: string | null;
    Cost_Per_Acre: number | null;
    Mobilization_Cost: number | null;
    quantity: number;
    methodology_id: number | null;
    TaskTemplates?: { description: string; classification: string | null; priority: string }[];
  };
  dataTables: { id: number; name: string; columnCount: number }[];
}

export default function EditDroneClient({ drone, dataTables }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/drones" className="hover:text-slate-900">Equipment</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {drone.Name ?? `Equipment #${drone.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <DroneForm droneId={drone.id} initialData={drone} onSuccess={() => router.push("/drones")} />
      </div>
      <div className="bg-white border rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b">
          <h3 className="text-sm font-semibold text-slate-900">Data Tables</h3>
          <Link
            href={`/data-tables/new?drone_id=${drone.id}`}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
          >
            + New
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          Data schemas produced by this piece of equipment (e.g. a GPS track, an analyzer&apos;s
          output), homed here so any test using this equipment can attach to them.
        </p>
        {dataTables.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No data tables yet.</p>
        ) : (
          <ul className="divide-y">
            {dataTables.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/data-tables/${t.id}/edit`} className="text-blue-600 hover:underline">
                  {t.name}
                </Link>
                <span className="text-xs text-slate-400">{t.columnCount} column{t.columnCount === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
