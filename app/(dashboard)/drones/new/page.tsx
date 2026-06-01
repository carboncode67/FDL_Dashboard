"use client";

import { useRouter } from "next/navigation";
import { DroneForm } from "@/components/forms/drone-form";
import Link from "next/link";

export default function NewDronePage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/drones" className="hover:text-slate-900">Drones</Link>
          <span>/</span>
          <span>New Drone</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Drone</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <DroneForm onSuccess={() => router.push("/drones")} />
      </div>
    </div>
  );
}
