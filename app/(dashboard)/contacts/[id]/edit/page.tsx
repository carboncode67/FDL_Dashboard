import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditContactClient from "./edit-client";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contactId = parseInt(id);

  const [contact, farms] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId } }),
    prisma.farm.findMany({ select: { id: true, Farm_Name: true }, orderBy: { id: "asc" } }),
  ]);

  if (!contact) notFound();

  const farmOptions = farms.map((f) => ({ id: f.id, name: f.Farm_Name ?? `Farm #${f.id}` }));

  return (
    <EditContactClient
      contactId={contact.id}
      farms={farmOptions}
      initialData={{
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        whatsapp: contact.whatsapp,
        farms_id: contact.farms_id,
      }}
    />
  );
}
