import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, resolveFarmIdForLabMember } from "@/lib/proximity";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const note = (formData.get("note") as string) ?? "";
    const ticket_ref = (formData.get("ticket_ref") as string) ?? "";
    const timestamp = (formData.get("timestamp") as string) ?? "";

    let filename = "";
    if (file && file.size > 0) {
      const dir = path.join(DATA_DIR, "documents");
      fs.mkdirSync(dir, { recursive: true });
      filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    }

    if (auth.kind === "labMember") {
      const farmId = await resolveFarmIdForLabMember(null, null);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          media_type: "document",
          filename: filename || null,
          content: note || null,
          date_collected: timestamp ? new Date(timestamp) : null,
          status: 2,
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, null, null);
      await prisma.document.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          filename,
          note: note || null,
          timestamp: timestamp ? new Date(timestamp) : null,
          status: 2,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/document]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
