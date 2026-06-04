import { prisma } from "@/lib/prisma";
import { ActivityReportClient } from "./activity-report-client";

export default async function ActivityReportPage() {
  const [contacts, subscriptions] = await Promise.all([
    prisma.contact.findMany({
      where: { whatsapp: true },
      select: { id: true, name: true, phone: true, Farm: { select: { Farm_Name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.reportingSubscription.findMany({ orderBy: { created_at: "desc" } }),
  ]);

  return (
    <ActivityReportClient
      contacts={contacts.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? "",
        farm_name: c.Farm?.Farm_Name ?? null,
      }))}
      initialSubscriptions={subscriptions.map(s => ({
        ...s,
        contact_ids: JSON.parse(s.contact_ids) as number[],
      }))}
    />
  );
}
