import { errorResponse } from "@/lib/api/respond";
import { deleteSearch, updateSearch } from "@/lib/searches";

/** PATCH /api/searches/:id {terms?, count?, daily?} */
export async function PATCH(request: Request, ctx: RouteContext<"/api/searches/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    return Response.json({ search: await updateSearch(id, body) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/searches/[id]">) {
  try {
    const { id } = await ctx.params;
    await deleteSearch(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
