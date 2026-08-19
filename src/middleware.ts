import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Refreshes the Supabase session cookie on navigation. Without this, server
 * components read an expired token and sign the user out mid-session.
 *
 * The Yoxa routes are excluded: they authenticate with a bearer token or an
 * HMAC signature, have no cookie, and must not be redirected.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api/yoxa|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
