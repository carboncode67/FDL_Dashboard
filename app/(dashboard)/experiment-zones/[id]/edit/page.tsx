import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canDelete, type Role } from "@/lib/roles";
import { DeleteZoneButton } from "../delete-button";
import EditZoneClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditZonePage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;

  const [[session, editMode], zone, fields] = await Promise.all([
    Promise.all([auth(), getEditMode()]),
    prisma.experimentZone.findUnique({ where: { id: parseInt(id) } }),
    prisma.field.findMany({ select: { id: true, Name: true }, orderBy: { id: "asc" } }),
  ]);

  if (!zone) notFound();

  const role = (session?.user?.role ?? "viewer") as Role;
  const showDelete = canDelete(role, editMode);

  return (
    <div className="space-y-4">
      {showDelete && (
        <div className="flex justify-end">
          <DeleteZoneButton zoneId={zone.id} zoneLabel={zone.Zone_Label} />
        </div>
      )}
      <EditZoneClient
        zone={{ id: zone.id, Zone_Label: zone.Zone_Label, Rep_Number: zone.Rep_Number, Fields_id: zone.Fields_id }}
        fields={fields.map((f) => ({ id: f.id, name: f.Name ?? `Field #${f.id}` }))}
      />
    </div>
  );
  });
}
