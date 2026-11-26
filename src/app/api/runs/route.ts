import { errorResponse } from "@/lib/api/respond";
import { advanceStaleRuns, createRun, listRuns } from "@/lib/runs";

/** GET /api/runs: run history, newest first. */
export async function GET() {
  try {
    await advanceStaleRuns(); // catch-up for runs whose webhook never arrived
    return Response.json({ runs: await listRuns() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/runs {tags: string[], count: number} -> {run_id, run} */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const run = await createRun(body.tags, body.count);
    return Response.json({ run_id: run.id, run }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
