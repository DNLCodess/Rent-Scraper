import { errorResponse } from "@/lib/api/respond";
import { advanceRun } from "@/lib/runs";

/** GET /api/runs/:id: status and progress. Polling this also advances the run. */
export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  try {
    const { id } = await ctx.params;
    const run = await advanceRun(id);
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    return Response.json({ run });
  } catch (err) {
    return errorResponse(err);
  }
}
