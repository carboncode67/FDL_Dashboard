import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReportData, generateReportHtml } from "@/lib/report-generator";

/**
 * GET /api/reporting/preview?subscription_id=1
 * GET /api/reporting/preview?contact_ids=1,2,3
 *
 * Returns the full HTML report for the given subscription or contact list.
 * Opens directly in the browser as a standalone page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subId       = searchParams.get("subscription_id");
  const contactsRaw = searchParams.get("contact_ids");

  let contactIds: number[] = [];

  if (subId) {
    const sub = await prisma.reportingSubscription.findUnique({
      where: { id: Number(subId) },
    });
    if (!sub) return new NextResponse("Subscription not found", { status: 404 });
    if (!sub.project_id) return new NextResponse("Subscription has no project set", { status: 400 });
    const contacts = await prisma.contact.findMany({
      where: { Farm: { ProjectFarms: { some: { Projects_id: sub.project_id } } } },
      select: { id: true },
    });
    contactIds = contacts.map(c => c.id);
  } else if (contactsRaw) {
    contactIds = contactsRaw.split(",").map(Number).filter(Boolean);
  } else {
    return new NextResponse("Provide subscription_id or contact_ids", { status: 400 });
  }

  const farmers = await buildReportData(contactIds, 14);
  const html    = generateReportHtml(farmers, 14);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
