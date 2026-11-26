import { connection } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { advanceStaleRuns } from "@/lib/runs";
import { createSearch, listSearches } from "@/lib/searches";

export async function GET() {
  await connection(); // request time only: never run during the build
  try {
    await advanceStaleRuns(); // catch-up for runs whose webhook never arrived
    return Response.json({ searches: await listSearches() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/searches {terms, count, daily?} */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const s = await createSearch({ terms: body.terms, count: body.count, daily: !!body.daily });
    return Response.json({ search: s }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
