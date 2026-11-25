import { errorResponse } from "@/lib/api/respond";
import { batchAction } from "@/lib/listings";
import { InputError } from "@/lib/runs";

/** POST /api/listings/batch {ids, type}: dismiss or shortlist `new` listings; returns {changed}. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.ids)) throw new InputError("ids must be an array");
    return Response.json(await batchAction(body.ids, body.type));
  } catch (err) {
    return errorResponse(err);
  }
}
