import { prisma } from "@/lib/prisma";

// Sampling maps are lab-member-only work (no farmer/Contact channel involved, unlike
// Forms/Geofences), so assignment eligibility is a straight user_id match -- no target-kind
// switch like lib/geofences.ts's resolveTargetLabel needs.

export const ASSIGNMENT_INCLUDE = {
  User: { select: { name: true, email: true } },
} as const;

export function assignmentWhereForLabMember(userId: string) {
  return { some: { user_id: userId } };
}

export async function isSamplingMapVisibleToLabMember(samplingMapId: number, userId: string): Promise<boolean> {
  const count = await prisma.samplingMapAssignment.count({
    where: { sampling_map_id: samplingMapId, user_id: userId },
  });
  return count > 0;
}

// A sampling point's parent map governs its visibility -- resolves the point's map_id first,
// then defers to the same check above. Returns null if the point doesn't exist.
export async function samplingMapIdForPoint(pointId: number): Promise<number | null> {
  const point = await prisma.samplingPoint.findUnique({
    where: { id: pointId },
    select: { sampling_map_id: true },
  });
  return point?.sampling_map_id ?? null;
}
