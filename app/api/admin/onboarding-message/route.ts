import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOnboardingMessage, setOnboardingMessage } from "@/lib/onboarding-message";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const message = await getOnboardingMessage();
  return NextResponse.json({ message });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message } = await req.json();
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  await setOnboardingMessage(message);
  return NextResponse.json({ message });
}
