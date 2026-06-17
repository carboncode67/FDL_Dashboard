import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isAuthPage = nextUrl.pathname.startsWith("/login");
  const isApiAuth  = nextUrl.pathname.startsWith("/api/auth");

  // These endpoints are called by external services (OFEDashBot) and must
  // not require a browser session. Upload and file-serving are already here;
  // contacts (token resolution) and whatsapp/send (send-message bridge) are added.
  const isMobileApi = nextUrl.pathname.startsWith("/api/upload")             ||
                      nextUrl.pathname.startsWith("/api/files")              ||
                      nextUrl.pathname.startsWith("/api/contacts")           ||
                      nextUrl.pathname.startsWith("/api/whatsapp")           ||
                      nextUrl.pathname.startsWith("/api/lab-members")        ||
                      nextUrl.pathname.startsWith("/api/lab-member-upload");

  if (isApiAuth || isMobileApi) return NextResponse.next();
  if (isAuthPage) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/", nextUrl));
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
