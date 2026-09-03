import { prisma } from "@/lib/prisma";

type AssignmentWithTargets = {
  contact_id: number | null;
  user_id: string | null;
  farm_id: number | null;
  farm_experiment_id: number | null;
  Contact?: { name: string } | null;
  User?: { name: string | null; email: string } | null;
  Farm?: { Farm_Name: string | null } | null;
  FarmExperiment?: { experiment_name: string | null } | null;
};

// Human-readable label for a Geofence_Assignment row's single non-null target.
export function resolveTargetLabel(a: AssignmentWithTargets): string {
  if (a.contact_id !== null) return a.Contact?.name ?? `Contact #${a.contact_id}`;
  if (a.user_id !== null) return a.User?.name ?? a.User?.email ?? `User #${a.user_id}`;
  if (a.farm_id !== null) return a.Farm?.Farm_Name ?? `Farm #${a.farm_id}`;
  if (a.farm_experiment_id !== null)
    return a.FarmExperiment?.experiment_name ?? `Experiment #${a.farm_experiment_id}`;
  return "Unknown target";
}

export const ASSIGNMENT_INCLUDE = {
  Contact: { select: { name: true } },
  User: { select: { name: true, email: true } },
  Farm: { select: { Farm_Name: true } },
  FarmExperiment: { select: { experiment_name: true } },
} as const;

// Eligibility filter: which Geofence_Assignments rows make a geofence visible
// to the given identity. Same known limitation as lib/forms.ts's equivalent:
// lab members only via direct assignment (no Farm<->User relation).
export function assignmentWhereForContact(contact: { id: number; farms_id: number | null; assigned_experiment_id: number | null }) {
  return {
    some: {
      OR: [
        { contact_id: contact.id },
        ...(contact.farms_id !== null ? [{ farm_id: contact.farms_id }] : []),
        ...(contact.assigned_experiment_id !== null ? [{ farm_experiment_id: contact.assigned_experiment_id }] : []),
      ],
    },
  };
}

export function assignmentWhereForLabMember(userId: string) {
  return { some: { user_id: userId } };
}

export async function isGeofenceVisibleToContact(geofenceId: number, contact: { id: number; farms_id: number | null; assigned_experiment_id: number | null }): Promise<boolean> {
  const count = await prisma.geofenceAssignment.count({
    where: {
      geofence_id: geofenceId,
      OR: [
        { contact_id: contact.id },
        ...(contact.farms_id !== null ? [{ farm_id: contact.farms_id }] : []),
        ...(contact.assigned_experiment_id !== null ? [{ farm_experiment_id: contact.assigned_experiment_id }] : []),
      ],
    },
  });
  return count > 0;
}

export async function isGeofenceVisibleToLabMember(geofenceId: number, userId: string): Promise<boolean> {
  const count = await prisma.geofenceAssignment.count({
    where: { geofence_id: geofenceId, user_id: userId },
  });
  return count > 0;
}
