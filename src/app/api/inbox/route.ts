import { connection } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { getInbox } from "@/lib/inbox";

/** GET /api/inbox: visible new listings, ranked, plus counts. */
export async function GET() {
  await connection(); // request time only: never run during the build
  try {
    return Response.json(await getInbox());
  } catch (err) {
    return errorResponse(err);
  }
}
