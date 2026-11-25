import { errorResponse } from "@/lib/api/respond";
import { InputError } from "@/lib/runs";
import { getSettingsView, setSetting } from "@/lib/settings";
import { MAX_COUNT } from "@/lib/types";

/** GET /api/settings: masked settings (the token itself is never returned). */
export async function GET() {
  try {
    return Response.json(await getSettingsView());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PUT /api/settings {apifyToken?, clearToken?, defaultCount?, defaultTags?}
 * Omitted fields are left unchanged.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.clearToken) await setSetting("apify_token", null);
    if (typeof body.apifyToken === "string" && body.apifyToken.trim()) {
      await setSetting("apify_token", body.apifyToken.trim());
    }
    if (body.defaultCount !== undefined) {
      const n = Math.floor(Number(body.defaultCount));
      if (!(n >= 1 && n <= MAX_COUNT)) throw new InputError(`Default count must be between 1 and ${MAX_COUNT}.`);
      await setSetting("default_count", String(n));
    }
    if (body.defaultTags !== undefined) {
      if (!Array.isArray(body.defaultTags)) throw new InputError("defaultTags must be an array");
      await setSetting("default_tags", JSON.stringify(body.defaultTags.map(String).slice(0, 5)));
    }
    return Response.json(await getSettingsView());
  } catch (err) {
    return errorResponse(err);
  }
}
