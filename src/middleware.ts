// Optimistic redirect only (D11): the real check is protectedProcedure on the server.
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (getSessionCookie(req)) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/partidas", "/partidas/:path*", "/practicar", "/practicar/:path*"],
};
