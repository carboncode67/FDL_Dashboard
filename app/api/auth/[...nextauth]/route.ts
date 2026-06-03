import { handlers } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const GET = handlers.GET;

export async function POST(req: NextRequest) {
  // Only rate-limit the credentials sign-in callback
  if (req.nextUrl.pathname === "/api/auth/callback/credentials") {
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      "unknown";

    const result = checkLoginRateLimit(ip);
    if (!result.allowed) {
      return new NextResponse("Too many login attempts. Try again later.", {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter) },
      });
    }
  }

  return handlers.POST(req);
}
