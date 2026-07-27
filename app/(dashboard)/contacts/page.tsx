import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, canEdit, type Role } from "@/lib/roles";
import { getUserFilters } from "@/lib/get-user-filters";
import { getOnboardingMessage } from "@/lib/onboarding-message";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  const userId = session?.user?.id ?? null;

  const { farmIds } = await getUserFilters(userId);

  const contactWhere = farmIds.length > 0 ? { farms_id: { in: farmIds } } : {};

  const activeFilter = farmIds.length > 0 ? { projectCount: 0, farmCount: farmIds.length } : null;

  const [contacts, onboardingMessage] = await Promise.all([
    prisma.contact.findMany({
      where: contactWhere,
      include: { Farm: { select: { id: true, Farm_Name: true } } },
      orderBy: { name: "asc" },
    }),
    getOnboardingMessage(),
  ]);

  const data = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    whatsapp: c.whatsapp,
    farm_name: c.Farm?.Farm_Name ?? null,
    created_at: c.created_at.toISOString(),
    can_onboard: c.token !== "",
    onboarded_at: c.onboarded_at ? c.onboarded_at.toISOString() : null,
  }));

  return (
    <ContactsClient
      data={data}
      canCreate={canCreate(role)}
      canEdit={canEdit(role)}
      activeFilter={activeFilter}
      onboardingMessage={onboardingMessage}
    />
  );
}
