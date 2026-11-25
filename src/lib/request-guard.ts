/**
 * CSRF guard for mutating API routes. The app uses HTTP Basic auth, which browsers
 * attach to cross-site requests too, so state-changing calls must prove they come
 * from this origin and carry JSON (which a cross-site form cannot send).
 */

export interface GuardRejection {
  status: 403 | 415;
  error: string;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function checkRequest(method: string, pathname: string, headers: Headers): GuardRejection | null {
  if (!pathname.startsWith("/api/")) return null;
  // These carry their own secrets and are called by Vercel / Apify, not browsers.
  if (pathname.startsWith("/api/cron/") || pathname.startsWith("/api/webhooks/")) return null;
  if (SAFE.has(method.toUpperCase())) return null;

  const site = headers.get("sec-fetch-site");
  let sameOrigin: boolean;
  if (site !== null) {
    sameOrigin = site === "same-origin" || site === "none";
  } else {
    const origin = headers.get("origin");
    const host = headers.get("host");
    try {
      sameOrigin = !!origin && !!host && new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin) return { status: 403, error: "Cross-site request blocked." };

  if (!(headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { status: 415, error: "Send JSON." };
  }
  return null;
}
