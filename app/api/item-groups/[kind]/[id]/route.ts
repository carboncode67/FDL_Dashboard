import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import {
  deleteItemGroup,
  findItemGroupByName,
  normalizeGroupName,
  parseItemGroupKind,
  renameItemGroup,
  MAX_GROUP_NAME_LENGTH,
} from "@/lib/item-groups";

export async function PATCH(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = await params;
  const kind = parseItemGroupKind(p.kind);
  if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = parseInt(p.id);

  const body = await req.json().catch(() => ({}));
  const name = normalizeGroupName(body.name);
  if (!name) {
    return NextResponse.json({ error: `Group name must be 1–${MAX_GROUP_NAME_LENGTH} characters` }, { status: 400 });
  }
  const clash = await findItemGroupByName(kind, name, id);
  if (clash) return NextResponse.json({ error: `A group named "${clash.name}" already exists` }, { status: 409 });

  return NextResponse.json(await renameItemGroup(kind, id, name));
  });
}

// Plain canEdit, not canDelete/Edit Mode: deleting a group removes no data — its forms/maps
// just move to Ungrouped (ON DELETE SET NULL).
export async function DELETE(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = await params;
  const kind = parseItemGroupKind(p.kind);
  if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteItemGroup(kind, parseInt(p.id));
  return new NextResponse(null, { status: 204 });
  });
}
