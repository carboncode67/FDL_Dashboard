import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEditMode, setEditMode } from "@/lib/edit-mode";

import { runWithTenant } from "@/lib/lab-db";
export async function GET() {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const editMode = await getEditMode();
  return NextResponse.json({ editMode });
  });
}

export async function POST(req: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { enabled } = await req.json();
  await setEditMode(Boolean(enabled));
  return NextResponse.json({ editMode: Boolean(enabled) });
  });
}
