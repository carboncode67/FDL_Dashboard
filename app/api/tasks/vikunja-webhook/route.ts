import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { fromVikunjaPriority, fromVikunjaStatus } from "@/lib/vikunja";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.VIKUNJA_WEBHOOK_SECRET;

function verifySignature(secret: string, rawBody: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface VikunjaWebhookPayload {
  event_name: string;
  data?: {
    task?: {
      id: number;
      done: boolean;
      priority: number;
      due_date?: string | null;
    };
  };
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (WEBHOOK_SECRET) {
    const signature = req.headers.get("x-vikunja-hmac") ?? "";
    if (!signature || !verifySignature(WEBHOOK_SECRET, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: VikunjaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event_name, data } = payload;
  const vikunjaTask = data?.task;

  if (!vikunjaTask?.id) return new NextResponse(null, { status: 200 });

  if (event_name === "task.updated") {
    const existing = await prisma.task.findFirst({
      where: { vikunja_task_id: vikunjaTask.id },
      select: { id: true, status: true },
    });
    if (existing) {
      await prisma.task.update({
        where: { id: existing.id },
        data: {
          status:   fromVikunjaStatus(vikunjaTask.done, existing.status),
          priority: fromVikunjaPriority(vikunjaTask.priority),
          due_date: vikunjaTask.due_date && vikunjaTask.due_date !== "0001-01-01T00:00:00Z"
            ? new Date(vikunjaTask.due_date)
            : null,
        },
      });
    }
  } else if (event_name === "task.deleted") {
    await prisma.task.updateMany({
      where: { vikunja_task_id: vikunjaTask.id },
      data: { vikunja_task_id: null },
    });
  }

  return new NextResponse(null, { status: 200 });
}
