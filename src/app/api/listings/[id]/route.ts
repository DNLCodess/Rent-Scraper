import { errorResponse } from "@/lib/api/respond";
import { addNote, getListing } from "@/lib/listings";
import { InputError } from "@/lib/runs";

/** GET /api/listings/:id: the listing with notes and highlights. */
export async function GET(_req: Request, ctx: RouteContext<"/api/listings/[id]">) {
  try {
    const { id } = await ctx.params;
    const listing = await getListing(id);
    if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });
    return Response.json({ listing });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/listings/:id {note}: add a note. */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    if (typeof body.note !== "string") throw new InputError("Write something before saving the note.");
    return Response.json({ note: await addNote(id, body.note) });
  } catch (err) {
    if (err instanceof InputError && err.message === "Listing not found") {
      return Response.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
