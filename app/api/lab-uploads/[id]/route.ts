import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const status = Number(body.status);
  if (![1, 2, 3, 4].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const upload = await prisma.labMemberUpload.update({
    where: { id: parseInt(id) },
    data: { status },
  });
  return NextResponse.json(upload);
}
