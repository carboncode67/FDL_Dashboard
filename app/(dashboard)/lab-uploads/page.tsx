import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserFilters } from "@/lib/get-user-filters";
import { LabUploadsClient } from "./lab-uploads-client";

export default async function LabUploadsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const { projectIds, farmIds } = await getUserFilters(userId);

  const uploadWhere = {
    ...(projectIds.length > 0 ? { project_id: { in: projectIds } } : {}),
    ...(farmIds.length > 0 ? { farm_id: { in: farmIds } } : {}),
  };

  const activeFilter =
    projectIds.length > 0 || farmIds.length > 0
      ? { projectCount: projectIds.length, farmCount: farmIds.length }
      : null;

  const uploads = await prisma.labMemberUpload.findMany({
    where: uploadWhere,
    include: {
      User: { select: { name: true } },
      Farm: { select: { Farm_Name: true } },
    },
    orderBy: { received_at: "desc" },
  });

  const data = uploads.map((u) => ({
    id: u.id,
    member_name: u.User?.name ?? null,
    farm_name: u.Farm?.Farm_Name ?? null,
    media_type: u.media_type,
    date_collected: u.date_collected?.toISOString() ?? null,
    status: u.status,
    received_at: u.received_at.toISOString(),
  }));

  return <LabUploadsClient data={data} activeFilter={activeFilter} />;
}
