import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { NewGeofencePage } from "./new-geofence-client";

export default async function NewGeofenceRoute() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!canCreate(role)) notFound();

  // Fetched once, up front, and passed down whole — the farm list (with each farm's fields) is
  // small enough to ship in the initial page load, so the wizard needs no client-side farm/
  // field fetching at all, matching this repo's server-component-queries-Prisma-directly rule.
  const farms = await prisma.farm.findMany({
    orderBy: { Farm_Name: "asc" },
    select: {
      id: true,
      Farm_Name: true,
      latitude: true,
      longitude: true,
      Fields: { select: { id: true, Name: true, geometry: true } },
    },
  });

  return <NewGeofencePage farms={farms} />;
}
