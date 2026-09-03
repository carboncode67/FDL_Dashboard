"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { GeofenceBasicsForm } from "@/components/geofence-basics-form";
import { GeofenceAssignmentPicker } from "@/components/geofence-assignment-picker";

type Assignment = {
  id: number;
  contact_id: number | null;
  user_id: string | null;
  farm_id: number | null;
  farm_experiment_id: number | null;
  target_label: string;
};

type ZoneSummary = {
  id: number;
  farm_name: string;
  radius_meters: number;
  field_names: string[];
};

interface Props {
  geofence: {
    id: number;
    title: string;
    description: string | null;
    action_message: string | null;
    is_active: boolean;
    notify_on_circle_entry: boolean;
    notify_on_field_entry: boolean;
  };
  zones: ZoneSummary[];
  assignments: Assignment[];
  contacts: { id: number; name: string }[];
  users: { id: string; name: string | null; email: string }[];
  farms: { id: number; Farm_Name: string | null }[];
  experiments: { id: number; experiment_name: string | null }[];
}

export default function EditGeofenceClient({ geofence, zones, assignments, contacts, users, farms, experiments }: Props) {
  const router = useRouter();

  // Zones auto-derive a Whole-Farm assignment per farm on creation — filter those farms out of
  // the manual picker's dropdown so it can't create a confusing duplicate row for a farm
  // already covered. Farms not tied to any zone stay available for manual/supplementary use.
  const alreadyAssignedFarmIds = new Set(assignments.filter((a) => a.farm_id !== null).map((a) => a.farm_id));
  const pickerFarms = farms.filter((f) => !alreadyAssignedFarmIds.has(f.id));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/geofences" className="hover:text-slate-900">Geofences</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {geofence.title}</h2>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <GeofenceBasicsForm geofenceId={geofence.id} initialData={geofence} onSuccess={() => router.refresh()} />
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b">
          <h3 className="text-sm font-semibold text-slate-900">Zones</h3>
          <span className="text-xs text-slate-400">To change zones, delete and recreate this geofence.</span>
        </div>
        {zones.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No zones.</p>
        ) : (
          <ul className="divide-y">
            {zones.map((z) => (
              <li key={z.id} className="py-2 text-sm">
                <span className="font-medium">{z.farm_name}</span>
                <span className="text-slate-500"> — {z.field_names.join(", ")}</span>
                <span className="text-xs text-slate-400 ml-2">({Math.round(z.radius_meters)}m radius)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Assigned To</h3>
        <GeofenceAssignmentPicker
          geofenceId={geofence.id}
          initialAssignments={assignments}
          contacts={contacts}
          users={users}
          farms={pickerFarms}
          experiments={experiments}
        />
      </div>

      <div className="bg-white border rounded-lg p-6">
        <Link href={`/geofences/${geofence.id}/events`} className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
          View Events →
        </Link>
      </div>
    </div>
  );
}
