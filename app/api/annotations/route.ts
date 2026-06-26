import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uploadId = searchParams.get("upload_id");
  const uploadTable = searchParams.get("upload_table");
  const taskId = searchParams.get("task_id");

  const annotations = await prisma.annotation.findMany({
    where: {
      ...(uploadId && uploadTable
        ? { upload_id: parseInt(uploadId), upload_table: uploadTable }
        : {}),
      ...(taskId ? { cvat_task_id: parseInt(taskId) } : {}),
    },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json(annotations);
}
