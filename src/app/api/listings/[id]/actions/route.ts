import { errorResponse } from "@/lib/api/respond";
import { applyAction, type ListingAction } from "@/lib/listings";
import { InputError } from "@/lib/runs";

/** POST /api/listings/:id/actions {type, ...}: move a listing along the tracker. */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/actions">) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.type !== "string") throw new InputError("Missing action type.");
    return Response.json({ listing: await applyAction(id, body as ListingAction) });
  } catch (err) {
    if (err instanceof InputError && err.message === "Listing not found") {
      return Response.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
