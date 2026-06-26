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
    TaskTemplates?: { description: string; classification: string | null; priority: string }[];
  };
}

export default function EditDroneClient({ drone }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/drones" className="hover:text-slate-900">Drones</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {drone.Name ?? `Drone #${drone.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <DroneForm droneId={drone.id} initialData={drone} onSuccess={() => router.push("/drones")} />
      </div>
    </div>
  );
}
