import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDataProduct } from "@/lib/data-products";
import { noteFrom, withGapSession } from "@/lib/processing-gaps-session";

// Lab-wide "never flag <data_product>" (migration 102). Admin only.

export async function GET() {
  return withGapSession("admin", async ({ labId }) => {
    const rows = await prisma.processingGapIgnore.findMany({ where: { lab_id: labId }, orderBy: { data_product: "asc" } });
    return NextResponse.json(rows);
  });
}

// POST {data_product, note?} — adds the ignore and dismisses that type's open flags.
export async function POST(req: Request) {
  return withGapSession("admin", async ({ session, labId }) => {
    const body = await req.json().catch(() => ({}));
    const product = body.data_product;
    if (!isDataProduct(product) || product === "none") {
      return NextResponse.json({ error: "Unknown data_product" }, { status: 400 });
    }
    const note = noteFrom(body);
    const [, dismissed] = await prisma.$transaction([
      prisma.processingGapIgnore.upsert({
        where: { lab_id_data_product: { lab_id: labId, data_product: product } },
        create: { lab_id: labId, data_product: product, created_by_id: session.user.id, note },
        update: {},
      }),
      prisma.processingGap.updateMany({
        where: { lab_id: labId, data_product: product, status: "open" },
        data: {
          status: "dismissed", decided_by_id: session.user.id, decided_at: new Date(),
          decision_note: note ?? "Type ignored lab-wide",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, dismissed: dismissed.count });
  });
}

// DELETE ?data_product=… — stop ignoring. Flags it dismissed stay dismissed;
// new observations of the type are flagged again.
export async function DELETE(req: Request) {
  return withGapSession("admin", async ({ labId }) => {
    const product = new URL(req.url).searchParams.get("data_product");
    const { count } = await prisma.processingGapIgnore.deleteMany({ where: { lab_id: labId, data_product: product ?? "" } });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
