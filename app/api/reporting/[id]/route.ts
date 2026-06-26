import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildReportData, generateReportHtml, generateEmailHtml } from "@/lib/report-generator";
import { Resend } from "resend";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const sub = await prisma.reportingSubscription.update({
    where: { id: Number(id) },
    data: {
      project_id: body.project_id ?? null,
      emails:     body.emails,
      frequency:  body.frequency,
      active:     body.active,
    },
  });
  return NextResponse.json(sub);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.reportingSubscription.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sub = await prisma.reportingSubscription.findUnique({
    where: { id: Number(id) },
  });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sub.project_id) return NextResponse.json({ error: "Subscription has no project set" }, { status: 400 });

  const contacts   = await prisma.contact.findMany({
    where: { Farm: { ProjectFarms: { some: { Projects_id: sub.project_id } } } },
    select: { id: true },
  });
  const contactIds = contacts.map(c => c.id);
  const farmers    = await buildReportData(contactIds, 14);
  const emails     = sub.emails.split(";").map(e => e.trim()).filter(Boolean);

  const now     = new Date();
  const month   = now.toLocaleString("default", { month: "long" });
  const subject = `Farmers Datalab — Activity Report — ${month} ${now.getFullYear()}`;
  const from    = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  let emailHtml: string;
  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    emailHtml = await generateEmailHtml(farmers, 14, baseUrl);
  } catch (e) {
    console.error("[Report] Puppeteer chart capture failed, falling back to no-chart email:", e);
    emailHtml = generateReportHtml(farmers, 14);
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from, to: emails, subject, html: emailHtml });
    await prisma.reportingSubscription.update({
      where: { id: sub.id },
      data:  { last_sent_at: now },
    });
    return NextResponse.json({ ok: true, sent_to: emails });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
