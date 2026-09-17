import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { ACTIVE_LAB_COOKIE } from "@/lib/lab-db";

// Sets/clears the "viewing as" lab cookie the header switcher uses. Platform
// admins only — everyone else's tenant is fixed to their own `lab_slug` and
// this route 403s them, so the cookie can never be set by a non-platform
// account even if crafted by hand.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.platform_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug } = await req.json();
  const res = NextResponse.json({ ok: true });

  if (!slug) {
    res.cookies.delete(ACTIVE_LAB_COOKIE);
    return res;
  }

  const lab = await basePrisma.lab.findUnique({ where: { slug, is_active: true }, select: { slug: true } });
  if (!lab) return NextResponse.json({ error: "Unknown lab" }, { status: 404 });

  // NODE_ENV is "production" in every deployed environment, including local
  // dev's plain-http Docker container — not a reliable https signal. Go off
  // the request's actual scheme instead (same signal a reverse-proxied
  // deploy needs via x-forwarded-proto), matching how NextAuth's own session
  // cookie decides whether to add __Secure- / the Secure attribute.
  const isHttps =
    new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

  res.cookies.set(ACTIVE_LAB_COOKIE, lab.slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
  });
  return res;
}
