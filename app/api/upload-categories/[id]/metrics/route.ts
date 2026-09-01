import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";

const VALID_FIELD_TYPES = ["text", "number", "select", "boolean"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user.role ?? "viewer") as Role;
  if (!canCreate(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const category_id = parseInt(id);
  const body = await req.json();

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  const field_type = VALID_FIELD_TYPES.includes(body.field_type) ? body.field_type : "text";
  const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
  const options =
    field_type === "select" && Array.isArray(body.options)
      ? body.options.filter((o: unknown) => typeof o === "string" && o.trim())
      : undefined;

  const maxOrder = await prisma.categoryMetric.aggregate({
    where: { category_id },
    _max: { sort_order: true },
  });

  const metric = await prisma.categoryMetric.create({
    data: {
      category_id,
      label,
      field_type,
      unit,
      options,
      sort_order: (maxOrder._max.sort_order ?? -1) + 1,
    },
  });
  return NextResponse.json(metric, { status: 201 });
}
