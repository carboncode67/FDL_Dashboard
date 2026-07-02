import { prisma } from "@/lib/prisma";
import { getOnboardingMessage } from "@/lib/onboarding-message";
import { WhatsAppClient } from "./whatsapp-client";

export default async function WhatsAppPage() {
  // Fetch all messaging contacts: anyone marked for WhatsApp, or anyone with
  // a channel explicitly set (covers SMS-only contacts ported from the old
  // whatsapp-integration branch's channel model).
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { whatsapp: true },
        { channel: { not: null } },
      ],
    },
    include: {
      Farm: { select: { id: true, Farm_Name: true } },
      Notes: { orderBy: { received_at: "desc" }, take: 1 },
      Photos: { orderBy: { received_at: "desc" }, take: 1 },
      Recordings: { orderBy: { received_at: "desc" }, take: 1 },
      Locations: { orderBy: { received_at: "desc" }, take: 1 },
      AssignedExperiment: { select: { id: true, experiment_name: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = contacts.map((c) => {
    // Find the most recent submission across all types
    const dates = [
      c.Notes[0]?.received_at,
      c.Photos[0]?.received_at,
      c.Recordings[0]?.received_at,
      c.Locations[0]?.received_at,
    ].filter(Boolean) as Date[];
    const lastSubmission = dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null;

    // Days since last submission
    const daysSince = lastSubmission
      ? Math.floor((Date.now() - lastSubmission.getTime()) / 86400000)
      : null;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone ?? "",
      farm_name: c.Farm?.Farm_Name ?? null,
      farm_id: c.farms_id ?? null,
      last_submission: lastSubmission?.toISOString() ?? null,
      days_since: daysSince,
      token: c.token,
      assigned_experiment_id: c.assigned_experiment_id ?? null,
      experiment_nickname: c.experiment_nickname ?? "",
      experiment_name: c.AssignedExperiment?.experiment_name ?? null,
      channel: c.channel ?? null,
      onboarded: c.onboarded_at !== null,
    };
  });

  const onboardingMessage = await getOnboardingMessage();

  return <WhatsAppClient data={data} onboardingMessage={onboardingMessage} />;
}
