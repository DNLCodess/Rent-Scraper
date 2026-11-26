import { NextResponse, type NextRequest } from "next/server";
import { checkAuth } from "@/lib/auth-gate";
import { checkRequest } from "@/lib/request-guard";

/**
 * HTTP Basic auth for the whole app. Set APP_PASSWORD (any username works). In production
 * (VERCEL_ENV=production) the app refuses to serve without it, so strangers can't start
 * runs on your Apify account. Dev and preview stay open when it is unset.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Cron and webhook routes authenticate with their own secrets.
  if (pathname.startsWith("/api/cron/") || pathname.startsWith("/api/webhooks/")) return NextResponse.next();

  // CSRF guard: Basic-auth credentials ride cross-site requests, so check before auth.
  const rejected = checkRequest(request.method, pathname, request.headers);
  if (rejected) return NextResponse.json({ error: rejected.error }, { status: rejected.status });

  const auth = checkAuth({
    password: process.env.APP_PASSWORD,
    vercelEnv: process.env.VERCEL_ENV,
    authorization: request.headers.get("authorization"),
  });
  if (auth.kind === "allow") return NextResponse.next();
  if (auth.kind === "unconfigured") {
    return new NextResponse(auth.message, { status: auth.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TikTok Rentals", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
