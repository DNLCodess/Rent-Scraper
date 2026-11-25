import { errorResponse } from "@/lib/api/respond";
import { blockAuthor, listBlocked, unblockAuthor } from "@/lib/preferences";
import { InputError } from "@/lib/runs";

/** GET /api/preferences/blocked: blocked agents with how many posts each hides. */
export async function GET() {
  try {
    return Response.json(await listBlocked());
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/preferences/blocked {handle}: returns the updated list. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.handle !== "string") throw new InputError("Send the agent handle to block.");
    await blockAuthor(body.handle);
    return Response.json(await listBlocked());
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/preferences/blocked?handle=: returns the updated list. */
export async function DELETE(request: Request) {
  try {
    const handle = new URL(request.url).searchParams.get("handle");
    if (!handle) throw new InputError("Send the agent handle to unblock.");
    await unblockAuthor(handle);
    return Response.json(await listBlocked());
  } catch (err) {
    return errorResponse(err);
  }
}
