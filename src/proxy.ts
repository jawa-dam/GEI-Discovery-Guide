import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/server/session";

/*
 * First line of defence for /guide/*: requests without a valid signed
 * account session never reach the premium routes. This is NOT the access
 * decision — a valid session only names an account. Every protected page
 * still calls requireEntitlement(), which checks the entitlement store.
 */
export function proxy(request: NextRequest) {
  const secret = process.env.ENTITLEMENT_SESSION_SECRET;
  const accountId = secret && secret.length >= 32 ? decodeSession(request.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  if (!accountId) {
    return NextResponse.redirect(new URL("/locked", request.url));
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  matcher: ["/guide", "/guide/:path*"]
};
