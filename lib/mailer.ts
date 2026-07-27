import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    if (!host) throw new Error("SMTP_HOST is not configured");
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<void> {
  const from = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER;
  if (!from) throw new Error("SMTP_FROM_EMAIL (or SMTP_USER) is not configured");

  await getTransporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  });
}
