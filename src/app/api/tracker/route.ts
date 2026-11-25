import { errorResponse } from "@/lib/api/respond";
import { getTracker } from "@/lib/tracker";

/** GET /api/tracker: active listings by stage, plus this week's inspections and nudges. */
export async function GET() {
  try {
    return Response.json(await getTracker());
  } catch (err) {
    return errorResponse(err);
  }
}
