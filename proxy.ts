import { auth } from "@/lib/auth";
import { tenantEnforcement } from "@/lib/lab-db";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isAuthPage = nextUrl.pathname.startsWith("/login");
  const isApiAuth  = nextUrl.pathname.startsWith("/api/auth");

  // Endpoints called by external services (mobile app, OFEDashBot) that must
  // not require a browser session. Route handlers still enforce their own
  // bearer-token / role checks.
  const isMobileApi = nextUrl.pathname.startsWith("/api/upload")   ||
                      nextUrl.pathname.startsWith("/api/files")    ||
                      nextUrl.pathname.startsWith("/api/data")     ||
                      nextUrl.pathname.startsWith("/api/contacts") ||
                      nextUrl.pathname.startsWith("/api/whatsapp") ||
                      nextUrl.pathname === "/api/pipelines/webhook" ||
                      nextUrl.pathname === "/api/basemaps/webhook" ||
                      (nextUrl.pathname.startsWith("/api/farms/") && (
                        nextUrl.pathname.endsWith("/summary") ||
                        nextUrl.pathname.endsWith("/transcript")
                      ));

  if (isApiAuth || isMobileApi) return NextResponse.next();
  if (isAuthPage) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/", nextUrl));
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // A cookie issued before this account had lab data (e.g. it survives a
  // redeploy that flips TENANT_ENFORCEMENT to "hard", or predates the lab
  // feature entirely) carries a JWT with no lab_slug. Every tenant-scoped
  // page/route wraps its body in runWithLab(), whose hard-mode guard throws
  // rather than silently falling back — that exception reaches the browser
  // mid-render as a broken/empty page load, not a clean error screen. This
  // is exactly the "works in a fresh private window, breaks in my normal
  // browser" symptom: a private window never carries the stale cookie.
  // Catch it here, before any page tries to run a query, and bounce to a
  // fresh sign-in instead. Harmless in "off"/"soft" mode, where a null
  // lab_slug is expected and never crashes anything.
  const user = req.auth?.user;
  const hasUsableLab = user?.platform_admin === true || !!user?.lab_slug;
  if (tenantEnforcement() === "hard" && !hasUsableLab) {
    const res = NextResponse.redirect(new URL("/login?reason=session-expired", nextUrl));
    for (const c of req.cookies.getAll()) {
      if (c.name.includes("authjs") || c.name.includes("next-auth")) {
        res.cookies.delete(c.name);
      }
    }
    return res;
  }

  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  if (isAdminRoute && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
