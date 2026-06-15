import { prisma } from "@/lib/prisma";
import { ActivityReportClient } from "./activity-report-client";

export default async function ActivityReportPage() {
  const [contacts, subscriptions, rawProjects] = await Promise.all([
    prisma.contact.findMany({
      where: { whatsapp: true },
      select: { id: true, name: true, phone: true, Farm: { select: { Farm_Name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.reportingSubscription.findMany({
      include: { Project: { select: { id: true, Project_Name: true } } },
      orderBy: { created_at: "desc" },
    }),
    prisma.project.findMany({
      select: {
        id: true,
        Project_Name: true,
        ProjectFarms: {
          select: {
            Farm: {
              select: {
                Farm_Name: true,
                Contacts: { select: { id: true, name: true }, orderBy: { name: "asc" } },
              },
            },
          },
        },
      },
      orderBy: [{ Project_Name: "asc" }],
    }),
  ]);

  const projects = rawProjects.map(p => ({
    id: p.id,
    Project_Name: p.Project_Name,
    contacts: p.ProjectFarms.flatMap(pf =>
      (pf.Farm?.Contacts ?? []).map(c => ({
        id: c.id,
        name: c.name,
        farm_name: pf.Farm?.Farm_Name ?? null,
      }))
    ),
  }));

  return (
    <ActivityReportClient
      contacts={contacts.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? "",
        farm_name: c.Farm?.Farm_Name ?? null,
      }))}
      projects={projects}
      initialSubscriptions={subscriptions.map(s => ({
        id: s.id,
        project_id: s.project_id,
        Project: s.Project ?? null,
        emails: s.emails,
        frequency: s.frequency,
        active: s.active,
        last_sent_at: s.last_sent_at,
      }))}
    />
  );
}
