import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const droneId = parseInt(id);
  const body = await req.json();
  const { contact_id, signed_out_at, due_at } = body;

  if (!contact_id || !due_at) {
    return NextResponse.json({ error: "contact_id and due_at are required" }, { status: 400 });
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
      contact_id: parseInt(contact_id),
      signed_out_by: session.user.id,
      signed_out_at: signed_out_at ? new Date(signed_out_at) : new Date(),
      due_at: new Date(due_at),
    },
    include: { Contact: true },
  });
  return NextResponse.json(loan, { status: 201 });
}
