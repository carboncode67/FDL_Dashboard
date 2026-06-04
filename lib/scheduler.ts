/**
 * Report scheduler — runs inside the Next.js process using node-cron.
 * Runs once a day at 07:00 server time and sends any subscription that is due.
 *
 * Frequency logic:
 *   weekly   — sends on Monday mornings
 *   biweekly — sends every other Monday
 *   monthly  — sends on the 1st of each month
 *
 * Called once from app/layout.tsx so it starts when the server starts.
 * In Docker/production it runs continuously alongside the Next.js server.
 */

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { buildReportData, generateReportHtml } from "@/lib/report-generator";
import { Resend } from "resend";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  // Run at 7:00 AM every day — check which subscriptions are due
  cron.schedule("0 7 * * *", async () => {
    console.log("[Scheduler] Checking reporting subscriptions...");
    const now   = new Date();
    const day   = now.getDay();   // 0=Sun 1=Mon
    const date  = now.getDate();

    const subs = await prisma.reportingSubscription.findMany({
      where: { active: true },
    });

    for (const sub of subs) {
      let isDue = false;

      if (sub.frequency === "weekly" && day === 1) {
        isDue = true;
      } else if (sub.frequency === "biweekly" && day === 1) {
        // Every other Monday — check if last sent was > 10 days ago
        const lastSent = sub.last_sent_at;
        if (!lastSent) {
          isDue = true;
        } else {
          const daysSince = (now.getTime() - new Date(lastSent).getTime()) / 86400000;
          isDue = daysSince >= 13;
        }
      } else if (sub.frequency === "monthly" && date === 1) {
        isDue = true;
      }

      if (!isDue) continue;

      try {
        const contactIds = JSON.parse(sub.contact_ids) as number[];
        const farmers    = await buildReportData(contactIds, 14);
        const html       = generateReportHtml(farmers, 14);
        const emails     = sub.emails.split(";").map(e => e.trim()).filter(Boolean);

        const month   = now.toLocaleString("default", { month: "long" });
        const subject = `Farmers Datalab — Activity Report — ${month} ${now.getFullYear()}`;
        const from    = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from, to: emails, subject, html });

        await prisma.reportingSubscription.update({
          where: { id: sub.id },
          data:  { last_sent_at: now },
        });

        console.log(`[Scheduler] Sent report "${sub.label}" to ${emails.join(", ")}`);
      } catch (e) {
        console.error(`[Scheduler] Failed to send report "${sub.label}":`, e);
      }
    }
  });

  console.log("[Scheduler] Report scheduler started — checks daily at 7:00 AM");
}
