import { prisma } from "@/lib/prisma";

// Normalized label matching: case-, whitespace- and underscore-insensitive.
// Same helper as app/api/data/experiment-tests/[id]/rows/route.ts — kept here
// too since it's shared by both the admin schema route and the bearer-token
// mobile submit route.
export function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, " ").trim();
}

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

// Human-readable label for a Form_Assignment row's single non-null target.
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

// Eligibility filter: which Form_Assignments rows make a form visible to the
// given identity. Contacts are eligible via direct assignment OR broad
// farm/experiment assignment; lab members only via direct assignment (there's
// no Farm<->User relation in the schema — lab members reach farms by GPS
// proximity, not a fixed assignment, so "assign to every lab member near this
// farm" isn't representable in v1).
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

export async function isFormVisibleToContact(formId: number, contact: { id: number; farms_id: number | null; assigned_experiment_id: number | null }): Promise<boolean> {
  const count = await prisma.formAssignment.count({
    where: {
      form_id: formId,
      OR: [
        { contact_id: contact.id },
        ...(contact.farms_id !== null ? [{ farm_id: contact.farms_id }] : []),
        ...(contact.assigned_experiment_id !== null ? [{ farm_experiment_id: contact.assigned_experiment_id }] : []),
      ],
    },
  });
  return count > 0;
}

export async function isFormVisibleToLabMember(formId: number, userId: string): Promise<boolean> {
  const count = await prisma.formAssignment.count({
    where: { form_id: formId, user_id: userId },
  });
  return count > 0;
}
