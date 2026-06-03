import { prisma } from "@/lib/prisma";
import { LabUploadsClient } from "./lab-uploads-client";

export default async function LabUploadsPage() {
  const uploads = await prisma.labMemberUpload.findMany({
    include: {
      LabMember: { select: { Name: true } },
      Farm: { select: { Farm_Name: true } },
    },
    orderBy: { received_at: "desc" },
  });

  const data = uploads.map((u) => ({
    id: u.id,
    member_name: u.LabMember?.Name ?? null,
    farm_name: u.Farm?.Farm_Name ?? null,
    media_type: u.media_type,
    date_collected: u.date_collected?.toISOString() ?? null,
    status: u.status,
    received_at: u.received_at.toISOString(),
  }));

  return <LabUploadsClient data={data} />;
}
