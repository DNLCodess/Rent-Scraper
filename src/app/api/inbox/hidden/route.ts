import { errorResponse } from "@/lib/api/respond";
import { getHidden } from "@/lib/inbox";

/** GET /api/inbox/hidden: new listings hidden by a rule, with the reason. */
export async function GET() {
  try {
    return Response.json(await getHidden());
  } catch (err) {
    return errorResponse(err);
  }
}
