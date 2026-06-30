import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const svc = process.env.FDL_SERVICE_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  const hasServiceToken = svc && header === `Bearer ${svc}`;

  if (!hasServiceToken) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone } = await params;
  const clean = phone.replace(/\D/g, "");
  if (!clean) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });

  const contacts = await prisma.contact.findMany({
    where: { phone: { not: null } },
    select: {
      id: true,
      name: true,
      phone: true,
      token: true,
      farms_id: true,
      is_lab_member: true,
      experiment_nickname: true,
      AssignedExperiment: { select: { experiment_name: true } },
    },
  });

  const match = contacts.find((c) => {
    const stored = (c.phone ?? "").replace(/\D/g, "");
    return stored.length >= 10 && clean.length >= 10 &&
      stored.slice(-10) === clean.slice(-10);
  });

  if (!match || !match.token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: match.id,
    name: match.name,
    token: match.token,
    farms_id: match.farms_id,
    is_lab_member: match.is_lab_member,
    experiment_name: match.experiment_nickname || match.AssignedExperiment?.experiment_name || "",
  });
}
