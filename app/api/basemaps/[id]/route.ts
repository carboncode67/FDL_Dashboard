import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreate, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";
import { prisma } from "@/lib/prisma";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { deleteFailedBasemap } from "@/lib/failed-uploads";

// "Delete" next to a failed/queued basemap in the farm map's "Processing:" list
// (lib/failed-uploads.ts). Same role as Retry: whoever can upload can clear a
// failed upload. A finished one (the map's × on it) also needs
// canDelete, like removing any map layer; one still processing 409s.
export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = parseInt((await params).id);
  const row = isNaN(id) ? null : await prisma.basemap.findUnique({ where: { id }, select: { farm_id: true } });
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!row || !scopeIncludesFarm(scope, row.farm_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return deleteFailedBasemap(id, undefined, canDelete(session.user.role, editMode));
  });
}
