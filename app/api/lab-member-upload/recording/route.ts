import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  if (auth.kind !== "labMember")
    return NextResponse.json({ error: "Lab member token required" }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const farmer_name = (formData.get("farmer_name") as string) ?? "";
    const startTime = (formData.get("startTime") as string) ?? "";
    const ticket_ref = (formData.get("ticket_ref") as string) ?? "";
    const latitude = formData.get("latitude") ? parseFloat(formData.get("latitude") as string) : null;
    const longitude = formData.get("longitude") ? parseFloat(formData.get("longitude") as string) : null;

    let filename = "";
    if (file && file.size > 0) {
      const dir = path.join(DATA_DIR, "lab-recordings");
      fs.mkdirSync(dir, { recursive: true });
      filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    }

    await prisma.labMemberUpload.create({
      data: {
        lab_member_id: auth.labMember.id,
        media_type: "recording",
        filename: filename || null,
        farmer_name: farmer_name || null,
        latitude: latitude,
        longitude: longitude,
        start_time: startTime ? new Date(startTime) : null,
        date_collected: startTime ? new Date(startTime) : null,
        ticket_ref: ticket_ref || null,
        status: 1,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lab-member-upload/recording]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
