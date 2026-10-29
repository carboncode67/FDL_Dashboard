import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { receiveFarmDocumentUpload } from "@/lib/farm-uploads";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: farmIdStr } = await params;
  const farmId = parseInt(farmIdStr);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm ID" }, { status: 400 });
  return receiveFarmDocumentUpload(req, farmId);
  });
}
