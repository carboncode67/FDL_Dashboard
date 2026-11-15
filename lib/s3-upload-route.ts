import { NextResponse } from "next/server";
import type { S3Upload } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { ownUpload } from "@/lib/s3-uploads";

// Shared wrapper for app/api/s3-uploads/[id]/*: session + canCreate + tenant
// binding, then the caller's own S3_Uploads row (404 for anyone else's).
export function withOwnS3Upload(
  params: Promise<{ id: string }>,
  fn: (upload: S3Upload) => Promise<NextResponse>,
): Promise<NextResponse> {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const row = await ownUpload(parseInt(id, 10), session.user.id);
    if (row instanceof NextResponse) return row;
    try {
      return await fn(row);
    } catch (e) {
      console.error(`[s3-uploads] upload ${row.id}`, e);
      return NextResponse.json({ error: "Storage request failed" }, { status: 502 });
    }
  });
}
