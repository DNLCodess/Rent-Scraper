import { errorResponse } from "@/lib/api/respond";
import { runSavedSearch } from "@/lib/searches";

/** POST /api/searches/:id/run: start a run from a saved search. */
export async function POST(_request: Request, ctx: RouteContext<"/api/searches/[id]/run">) {
  try {
    const { id } = await ctx.params;
    return Response.json({ run: await runSavedSearch(id) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
