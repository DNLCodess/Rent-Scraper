import { NextResponse, type NextRequest } from "next/server";
import { checkRequest } from "@/lib/request-guard";

/**
 * Optional HTTP Basic auth for the whole app. Set APP_PASSWORD (any username works)
 * when deploying publicly, so strangers can't start runs on your Apify account.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Cron and webhook routes authenticate with their own secrets.
  if (pathname.startsWith("/api/cron/") || pathname.startsWith("/api/webhooks/")) return NextResponse.next();

  // CSRF guard: Basic-auth credentials ride cross-site requests, so check before auth.
  const rejected = checkRequest(request.method, pathname, request.headers);
  if (rejected) return NextResponse.json({ error: rejected.error }, { status: rejected.status });

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TikTok Rentals", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
