import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { NewGeofencePage } from "./new-geofence-client";

export default async function NewGeofenceRoute() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!canCreate(role)) notFound();

  return <NewGeofencePage />;
}
