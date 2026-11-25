import { advanceRunByJobId } from "@/lib/runs";
import { safeEqual } from "@/lib/secret";

/**
 * POST /api/webhooks/apify?secret=...: Apify run-finished webhook (default payload,
 * `resource` is the run object). Ingest is idempotent, so duplicates and late
 * deliveries are harmless. Always 200 on a known secret so Apify does not retry forever.
 */
export async function POST(request: Request) {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  const supplied = new URL(request.url).searchParams.get("secret");
  if (!secret || !safeEqual(supplied, secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const id = body?.resource?.id;
    if (typeof id === "string" && id) await advanceRunByJobId(id);
  } catch (err) {
    console.error("Apify webhook failed", err);
  }
  return Response.json({ ok: true });
}
