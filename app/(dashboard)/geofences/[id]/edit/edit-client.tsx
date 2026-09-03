"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { GeofenceBasicsForm } from "@/components/geofence-basics-form";
import { GeofenceAssignmentPicker } from "@/components/geofence-assignment-picker";
import FieldMapWrapper from "@/components/field-map-wrapper";

type Assignment = {
  id: number;
  contact_id: number | null;
  user_id: string | null;
  farm_id: number | null;
  farm_experiment_id: number | null;
  target_label: string;
};

interface Props {
  geofence: {
    id: number;
    title: string;
    description: string | null;
    geometry: string;
    action_message: string;
    is_active: boolean;
  };
  assignments: Assignment[];
  contacts: { id: number; name: string }[];
  users: { id: string; name: string | null; email: string }[];
  farms: { id: number; Farm_Name: string | null }[];
  experiments: { id: number; experiment_name: string | null }[];
}

export default function EditGeofenceClient({ geofence, assignments, contacts, users, farms, experiments }: Props) {
  const router = useRouter();

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
          <h3 className="text-sm font-semibold text-slate-900">Boundary</h3>
          <Link href={`/geofences/${geofence.id}/draw`} className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
            Redraw boundary →
          </Link>
        </div>
        <FieldMapWrapper fieldName={geofence.title} geometry={geofence.geometry} />
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Assigned To</h3>
        <GeofenceAssignmentPicker
          geofenceId={geofence.id}
          initialAssignments={assignments}
          contacts={contacts}
          users={users}
          farms={farms}
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
