import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/whatsapp/send
 *
 * Forwards a send-message request to OFEDashBot, which holds the Twilio
 * credentials. The dashboard never calls Twilio directly.
 *
 * Body: { phone: string, message: string }
 *
 * OFEDashBot must expose POST /send-message (added in its config).
 * OFEDASHBOT_URL is set in .env.local.
 */
export async function POST(req: NextRequest) {
  // Require an authenticated dashboard session
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone, message } = await req.json();
  if (!phone || !message) {
    return NextResponse.json({ error: "phone and message are required" }, { status: 400 });
  }

  const botUrl = process.env.OFEDASHBOT_URL;
  if (!botUrl) {
    return NextResponse.json(
      { error: "OFEDASHBOT_URL not configured in .env.local" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${botUrl}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Could not reach OFEDashBot" }, { status: 502 });
  }
}
