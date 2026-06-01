import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditProtocolClient from "./edit-client";

export default async function EditProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const protocol = await prisma.treatmentProtocol.findUnique({ where: { id: parseInt(id) } });
  if (!protocol) notFound();
  return (
    <EditProtocolClient
      protocol={{
        id: protocol.id,
        Protocol_Name: protocol.Protocol_Name,
        Product: protocol.Product,
        Rate: protocol.Rate ? Number(protocol.Rate) : null,
        Rate_Unit: protocol.Rate_Unit,
        Timing: protocol.Timing,
        Notes: protocol.Notes,
      }}
    />
  );
}
