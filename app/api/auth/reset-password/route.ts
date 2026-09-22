import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { basePrisma } from "@/lib/prisma";
import { hashResetToken } from "@/lib/password-reset";

export async function POST(req: NextRequest) {
  const { token, newPassword } = await req.json().catch(() => ({}));

  if (!token || typeof token !== "string" || !newPassword || typeof newPassword !== "string") {
    return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const tokenHash = hashResetToken(token);
  const user = await basePrisma.user.findFirst({
    where: {
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: { gt: new Date() },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await basePrisma.user.update({
    where: { id: user.id },
    data: {
      password: hash,
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    },
  });

  return NextResponse.json({ ok: true });
}
