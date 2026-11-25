import "server-only";
import { db } from "./db";
import { ApifyScraper } from "./scraper/apify";
import { MockScraper } from "./scraper/mock";
import { ScraperError, type Scraper } from "./scraper/types";
import type { SettingsView } from "./types";

/**
 * Settings live in the database, with environment variables as the fallback.
 * The Apify token never leaves the server: the client only sees a masked preview.
 */

export async function getSetting(key: string): Promise<string | null> {
  const r = await (await db()).execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
  return (r.rows[0]?.value as string | undefined) ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  const c = await db();
  if (value === null || value === "") {
    await c.execute({ sql: "DELETE FROM settings WHERE key = ?", args: [key] });
  } else {
    await c.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, value],
    });
  }
}

const provider = (): SettingsView["provider"] => (process.env.SCRAPER_PROVIDER === "mock" ? "mock" : "apify");

async function apifyToken(): Promise<{ token: string; source: "settings" | "env" } | null> {
  const saved = await getSetting("apify_token");
  if (saved) return { token: saved, source: "settings" };
  if (process.env.APIFY_TOKEN) return { token: process.env.APIFY_TOKEN, source: "env" };
  return null;
}

export async function getSettingsView(): Promise<SettingsView> {
  const tok = await apifyToken();
  const defaultTags = await getSetting("default_tags");
  return {
    provider: provider(),
    tokenSet: !!tok,
    tokenSource: tok?.source ?? null,
    tokenPreview: tok ? `••••${tok.token.slice(-4)}` : null,
    defaultCount: Number(await getSetting("default_count")) || 30,
    defaultTags: defaultTags ? (JSON.parse(defaultTags) as string[]) : ["lagosapartments"],
  };
}

/** The configured scraper. Throws TOKEN_MISSING when Apify has no token. */
export async function getScraper(): Promise<Scraper> {
  if (provider() === "mock") return new MockScraper();
  const tok = await apifyToken();
  if (!tok) {
    throw new ScraperError("TOKEN_MISSING", "No Apify API token is set. Add one in Settings to start scraping.");
  }
  return new ApifyScraper(tok.token);
}
