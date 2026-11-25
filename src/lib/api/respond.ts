import "server-only";
import { InputError } from "../runs";
import { ScraperError } from "../scraper/types";

/** Turn thrown errors into JSON responses with a sensible status code. */
export function errorResponse(err: unknown): Response {
  if (err instanceof InputError) return Response.json({ error: err.message }, { status: 400 });
  if (err instanceof ScraperError) {
    return Response.json({ error: err.message, code: err.code }, { status: 502 });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong on the server. Try again." }, { status: 500 });
}
