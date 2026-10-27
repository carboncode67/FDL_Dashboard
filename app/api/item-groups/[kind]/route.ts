import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreate, canEdit, type Role } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import {
  createItemGroup,
  findItemGroupByName,
  listItemGroups,
  normalizeGroupName,
  parseItemGroupKind,
  reorderItemGroups,
  MAX_GROUP_NAME_LENGTH,
} from "@/lib/item-groups";

// kind = "forms" | "sampling-maps" — see lib/item-groups.ts.
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = parseItemGroupKind((await params).kind);
  if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await listItemGroups(kind));
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const kind = parseItemGroupKind((await params).kind);
  if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = normalizeGroupName(body.name);
  if (!name) {
    return NextResponse.json({ error: `Group name must be 1–${MAX_GROUP_NAME_LENGTH} characters` }, { status: 400 });
  }
  const existing = await findItemGroupByName(kind, name);
  if (existing) return NextResponse.json({ error: `A group named "${existing.name}" already exists` }, { status: 409 });

  return NextResponse.json(await createItemGroup(kind, name), { status: 201 });
  });
}

// Reorder: body { ids: number[] } in display order.
export async function PUT(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const kind = parseItemGroupKind((await params).kind);
  if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
  await reorderItemGroups(kind, ids);
  return NextResponse.json(await listItemGroups(kind));
  });
}
