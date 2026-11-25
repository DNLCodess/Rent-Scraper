import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { getRun, parseFilters, queryListings, runAreas } from "@/lib/runs";
import type { ListingsResponse } from "@/lib/types";

/** GET /api/runs/:id/listings?q&minPrice&maxPrice&area&beds&maxAgeDays&hasPrice */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/runs/[id]/listings">) {
  try {
    const { id } = await ctx.params;
    const run = await getRun(id);
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    const [listings, areas] = await Promise.all([
      queryListings(id, parseFilters(req.nextUrl.searchParams)),
      runAreas(id),
    ]);
    const body: ListingsResponse = { listings, total: run.result_count, areas };
    return Response.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
