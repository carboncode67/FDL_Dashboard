import { auth } from "@/lib/auth";
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

  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  if (isAdminRoute && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
