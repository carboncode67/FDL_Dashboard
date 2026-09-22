import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { generateResetToken } from "@/lib/password-reset";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mailer";

// Generic response for every outcome (unknown email, SMTP unconfigured, DB
// error) — never reveal whether an account exists for the submitted address.
const GENERIC_MESSAGE = "If an account exists for that email, a reset link has been sent.";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";

  const { allowed, retryAfter } = checkPasswordResetRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }

  const { email } = await req.json().catch(() => ({ email: undefined }));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    // Login itself doesn't know a user's lab until it finds their row, so it
    // queries basePrisma directly (see lib/prisma.ts) — same reasoning applies
    // here, before any session/lab context exists.
    const user = await basePrisma.user.findUnique({ where: { email } });

    if (user) {
      const { token, tokenHash, expiresAt } = generateResetToken();
      await basePrisma.user.update({
        where: { id: user.id },
        data: { password_reset_token_hash: tokenHash, password_reset_expires_at: expiresAt },
      });

      const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      if (process.env.SMTP_HOST) {
        await sendMail({
          to: user.email,
          subject: "Reset your Farmers Database password",
          html: `
            <p>A password reset was requested for your Farmers Database account.</p>
            <p><a href="${resetUrl}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
            <p>If you didn't request this, you can ignore this email — your password won't change.</p>
          `,
        });
      } else {
        // No SMTP configured in this environment — the token is still stored,
        // so an admin with DB access can hand the link to the user directly.
        console.warn(
          `[forgot-password] SMTP not configured; reset link for ${user.email}: ${resetUrl}`
        );
      }
    }
  } catch (err) {
    console.error("[forgot-password] failed:", err);
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
