import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateGap } from "@/lib/processing-gaps";
import { noteFrom, withGapSession } from "@/lib/processing-gaps-session";

// POST /api/processing-gaps/:id  {action: "dismiss", note?} | {action: "reopen"}
// Dismiss = one-off data, no tool needed; it stays dismissed through
// re-observation. Re-open hands the row back to the normal rules, which may
// also resolve or remove it if things changed meanwhile.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withGapSession("edit", async ({ session, labId }) => {
    const id = Number.parseInt((await params).id, 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const gap = await prisma.processingGap.findFirst({ where: { id, lab_id: labId } });
    if (!gap) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.action === "dismiss") {
      if (gap.status !== "open") return NextResponse.json({ error: `Flag is ${gap.status}` }, { status: 409 });
      const row = await prisma.processingGap.update({
        where: { id },
        data: { status: "dismissed", decided_by_id: session.user.id, decided_at: new Date(), decision_note: noteFrom(body) },
      });
      return NextResponse.json(row);
    }
    if (body.action === "reopen") {
      if (gap.status !== "dismissed") return NextResponse.json({ error: `Flag is ${gap.status}` }, { status: 409 });
      await prisma.processingGap.update({
        where: { id },
        data: { status: "open", decided_by_id: null, decided_at: null, decision_note: null },
      });
      const outcome = await evaluateGap(gap.source_table, gap.source_id);
      return NextResponse.json({ ok: true, outcome });
    }
    return NextResponse.json({ error: 'action must be "dismiss" or "reopen"' }, { status: 400 });
  });
}
