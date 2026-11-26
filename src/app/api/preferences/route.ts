import { connection } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { reopenHunt } from "@/lib/listings";
import { getPreferences, updatePreferences } from "@/lib/preferences";
import { InputError } from "@/lib/runs";

/** GET /api/preferences: the saved hunt preferences. */
export async function GET() {
  await connection(); // request time only: never run during the build
  try {
    return Response.json(await getPreferences());
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/preferences {…partial Preferences}: unknown keys are ignored. */
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InputError("Send a JSON object of preferences to update.");
    }
    return Response.json(await updatePreferences(body));
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/preferences {reopen: true}: reopens a finished hunt (un-archives the tracker, resumes daily searches). */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || body.reopen !== true) throw new InputError("Send {\"reopen\": true} to reopen the hunt.");
    await reopenHunt();
    return Response.json(await getPreferences());
  } catch (err) {
    return errorResponse(err);
  }
}
