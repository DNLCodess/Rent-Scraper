import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { getRun, parseFilters, queryListings, toCsv } from "@/lib/runs";

/** GET /api/runs/:id/export.csv: same filters as /listings, as a CSV download. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/runs/[id]/export.csv">) {
  try {
    const { id } = await ctx.params;
    const run = await getRun(id);
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    const listings = await queryListings(id, parseFilters(req.nextUrl.searchParams));
    const date = run.created_at.slice(0, 10);
    return new Response(toCsv(listings), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tiktok-rentals-${date}-${id.slice(0, 8)}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
