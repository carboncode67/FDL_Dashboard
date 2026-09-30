import { prisma } from "@/lib/prisma";

// Planned Changes item 15/16: sampling maps can now be sent the same way Forms/Geofences
// are -- an individual farmer (Contact), an individual lab member (User), or broadly to
// everyone tied to a Farm or Farm_Experiment. Mirrors lib/forms.ts's equivalents exactly.

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

// Human-readable label for a Sampling_Map_Assignments row's single non-null target.
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

// Eligibility filter: which Sampling_Map_Assignments rows make a map visible to the given
// identity. Contacts are eligible via direct assignment OR broad farm/experiment assignment
// (same as Forms); lab members only via direct assignment -- there's no Farm<->User relation
// in the schema (lab members reach farms by GPS proximity, not a fixed assignment).
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

export async function isSamplingMapVisibleToContact(samplingMapId: number, contact: { id: number; farms_id: number | null; assigned_experiment_id: number | null }): Promise<boolean> {
  const count = await prisma.samplingMapAssignment.count({
    where: {
      sampling_map_id: samplingMapId,
      OR: [
        { contact_id: contact.id },
        ...(contact.farms_id !== null ? [{ farm_id: contact.farms_id }] : []),
        ...(contact.assigned_experiment_id !== null ? [{ farm_experiment_id: contact.assigned_experiment_id }] : []),
      ],
    },
  });
  return count > 0;
}

export async function isSamplingMapVisibleToLabMember(samplingMapId: number, userId: string): Promise<boolean> {
  const count = await prisma.samplingMapAssignment.count({
    where: { sampling_map_id: samplingMapId, user_id: userId },
  });
  return count > 0;
}

// A sampling point's parent map governs its visibility -- resolves the point's map_id first,
// then defers to the checks above. Returns null if the point doesn't exist.
export async function samplingMapIdForPoint(pointId: number): Promise<number | null> {
  const point = await prisma.samplingPoint.findUnique({
    where: { id: pointId },
    select: { sampling_map_id: true },
  });
  return point?.sampling_map_id ?? null;
}
