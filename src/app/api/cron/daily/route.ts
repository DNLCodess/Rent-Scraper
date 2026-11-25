import { errorResponse } from "@/lib/api/respond";
import { runDailySearches } from "@/lib/searches";
import { safeEqual } from "@/lib/secret";

/** GET /api/cron/daily: called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return Response.json(await runDailySearches());
  } catch (err) {
    return errorResponse(err);
  }
}
