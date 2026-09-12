import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import EditFarmClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditFarmPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const farm = await prisma.farm.findUnique({ where: { id: parseInt(id) } });
  if (!farm) notFound();
  const session = await auth();
  const scope = await getEffectiveScope(session?.user?.id ?? null, session?.user?.category);
  if (!scopeIncludesFarm(scope, farm.id)) notFound();
  return (
    <EditFarmClient
      farm={{
        id: farm.id,
        Farm_Name: farm.Farm_Name,
        farm_summary: farm.farm_summary,
        interview_transcript: farm.interview_transcript,
        is_active: farm.is_active,
        address: farm.address,
        latitude: farm.latitude,
        longitude: farm.longitude,
      }}
    />
  );
  });
}
