import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Read-only chronological log — repeatable forms have no pending/completed
// state, so this is just history, optionally filtered to one recipient.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contact_id");
  const userId = searchParams.get("user_id");

  const responses = await prisma.formResponse.findMany({
    where: {
      form_id: parseInt(id),
      ...(contactId ? { contact_id: parseInt(contactId) } : {}),
      ...(userId ? { user_id: userId } : {}),
    },
    include: {
      Contact: { select: { name: true } },
      User: { select: { name: true, email: true } },
    },
    orderBy: { submitted_at: "desc" },
  });

  return NextResponse.json(
    responses.map((r) => ({
      id: r.id,
      data: r.data,
      submitted_at: r.submitted_at,
      recipient: r.Contact?.name ?? r.User?.name ?? r.User?.email ?? "Unknown",
    }))
  );
}
