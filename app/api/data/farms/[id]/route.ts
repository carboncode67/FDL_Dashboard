import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: {
      id: true,
      Farm_Name: true,
      County: true,
      State: true,
      title: true,
      farm_summary: true,
      interview_transcript: true,
      Contacts: { where: { is_lab_member: false }, take: 1, select: { name: true, phone: true, email: true } },
    },
  });

  if (!farm) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { Contacts, interview_transcript, ...rest } = farm;
  return NextResponse.json({
    ...rest,
    interview_transcript_present: Boolean(interview_transcript),
    Farmer_Name: Contacts[0]?.name ?? null,
    Contact_Phone: Contacts[0]?.phone ?? null,
    Contact_Email: Contacts[0]?.email ?? null,
  });
}
