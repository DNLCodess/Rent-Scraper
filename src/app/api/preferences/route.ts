import { errorResponse } from "@/lib/api/respond";
import { getPreferences, updatePreferences } from "@/lib/preferences";
import { InputError } from "@/lib/runs";

/** GET /api/preferences: the saved hunt preferences. */
export async function GET() {
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
