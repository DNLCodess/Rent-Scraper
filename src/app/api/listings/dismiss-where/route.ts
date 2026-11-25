import { errorResponse } from "@/lib/api/respond";
import { dismissWhere } from "@/lib/listings";
import { InputError } from "@/lib/runs";

/** POST /api/listings/dismiss-where {author} | {area}: dismiss matching `new` listings. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.author === "string") return Response.json(await dismissWhere({ author: body.author }));
    if (typeof body.area === "string") return Response.json(await dismissWhere({ area: body.area }));
    throw new InputError("Send an author or an area.");
  } catch (err) {
    return errorResponse(err);
  }
}
