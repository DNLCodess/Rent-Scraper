import { db } from "@/lib/db";
import { fetchThumbnail } from "@/lib/tiktok";

/** GET /api/cover/[id]: 302 to the listing's TikTok thumbnail; 404 if unknown or unavailable. */
export async function GET(_req: Request, ctx: RouteContext<"/api/cover/[id]">) {
  const { id } = await ctx.params;
  const rs = await (await db()).execute({ sql: "SELECT url FROM listings WHERE id = ?", args: [id] });
  const url = rs.rows[0]?.url;
  if (typeof url !== "string") return new Response("Not found", { status: 404 });
  const thumb = await fetchThumbnail(url);
  if (!thumb) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: thumb, "Cache-Control": "public, max-age=1800" },
  });
}
