import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const droneId = parseInt(id);
  const body = await req.json();
  const { contact_id, renter_user_id, signed_out_at, due_at } = body;

  if (!due_at || (!contact_id && !renter_user_id) || (contact_id && renter_user_id)) {
    return NextResponse.json(
      { error: "due_at and exactly one of contact_id or renter_user_id are required" },
      { status: 400 }
    );
  }

  const drone = await prisma.drone.findUnique({ where: { id: droneId } });
  if (!drone) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const activeCount = await prisma.equipmentLoan.count({
    where: { drone_id: droneId, returned_at: null },
  });
  if (activeCount >= drone.quantity) {
    return NextResponse.json({ error: "All units of this item are currently signed out" }, { status: 409 });
  }

  const loan = await prisma.equipmentLoan.create({
    data: {
      drone_id: droneId,
      contact_id: contact_id ? parseInt(contact_id) : null,
      renter_user_id: renter_user_id ?? null,
      signed_out_by: session.user.id,
      signed_out_at: signed_out_at ? new Date(signed_out_at) : new Date(),
      due_at: new Date(due_at),
    },
    include: { Contact: true, RenterUser: true },
  });
  return NextResponse.json(loan, { status: 201 });
  });
}
