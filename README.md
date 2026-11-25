# TikTok Rentals

Collects house-for-rent posts from TikTok by hashtag or keyword, pulls out **price, area, bedrooms and phone/WhatsApp numbers** from captions and creator bios, and shows them in a filterable table with CSV export.

Built for renters and agents in Nigeria (Lagos, Ibadan, Abuja).

> **Notice:** scraping may breach TikTok's Terms of Service. The app only collects public data. You are responsible for how you use it.

## How it works

```
Browser (Next.js UI)
   │  POST /api/runs  → starts one Apify actor run per tag
   │  GET  /api/runs/:id (polled every 2s) → checks Apify, ingests finished runs
   ▼
Next.js route handlers ──► Apify "TikTok Scraper" actor (clockworks/tiktok-scraper)
   │
   ├─ parser.ts: regex + keyword lists → price_ngn, period, area, bedrooms, phone
   └─ libSQL: local SQLite file, or Turso in production
```

- **No background worker.** Each status poll advances the run, so the app runs on serverless hosting such as Vercel.
- **Scraper interface.** Everything provider-specific sits behind `Scraper` in `src/lib/scraper/types.ts`. Providers:
  - `apify.ts`: the real Apify scraper.
  - `mock.ts`: free sample data for development.
- **Deduplication.** Each TikTok video is stored once, keyed by video ID. A later run that finds the same video links to it and shows a "Seen before" badge.

## Setup

Requirements: Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local
```

To try the app for free, set `SCRAPER_PROVIDER=mock` in `.env.local`. To scrape real data, get an Apify token:

1. Create an account at [apify.com](https://apify.com). The free plan includes monthly credit.
2. In Apify Console, go to **Settings → API & Integrations** and copy your **Personal API token**.
3. Put the token in `APIFY_TOKEN` in `.env.local`, or paste it into the app's **Settings** page later.

Pricing for the actor is per result; see the [actor's pricing page](https://apify.com/clockworks/tiktok-scraper/pricing). The app never requests charged add-ons such as video downloads, and it caps every run with `maxItems`.

## Run

```bash
pnpm dev        # http://localhost:3000
pnpm test       # parser unit tests (vitest)
pnpm lint
pnpm build && pnpm start
```

1. On **Search**, enter one or more tags and press Enter after each.
   - `lagosapartments` or `#lagosapartments` is searched as a hashtag.
   - A phrase with spaces, such as `2 bedroom yaba`, is searched as a keyword.
2. Choose how many videos per tag (max 100), then click **Run**.
3. When the run finishes, filter by price, area, bedrooms and posting date, sort the columns, and click **Export CSV**. The export uses the current filters.
4. Find past runs under **History**.

Price filters accept shorthand: `500k`, `1.5m`, `800,000`.

## Deploy (Vercel)

1. Create a [Turso](https://turso.tech) database. On Vercel the filesystem is temporary, so a local SQLite file would be lost.
2. Set these environment variables in Vercel:
   - `DATABASE_URL`: your Turso database URL (`libsql://...`).
   - `DATABASE_AUTH_TOKEN`: your Turso auth token.
   - `APIFY_TOKEN`: your Apify token.
   - `APP_PASSWORD`: strongly recommended. Without it, anyone who finds the URL can start runs on your Apify account.
3. Deploy. The tables are created automatically on first request.

## Error messages

| Situation | What you see |
| --- | --- |
| No token set | A notice on the Search page; failed runs link to Settings |
| Token invalid or expired | "Your Apify API token is invalid or expired. Update it in Settings." with **Open Settings** and **Retry** |
| Apify out of credit | A message asking you to check your Apify billing |
| Network errors, Apify 429 or 5xx | Retried automatically with exponential backoff (3 attempts) |
| One tag fails but others succeed | The run finishes with the results it has, and a note lists the failed tags |

## Parser

`src/lib/parser.ts` is pure and unit-tested in `src/lib/parser.test.ts` with real-style Nigerian captions.

| Field | Handles |
| --- | --- |
| Price | `₦1.5m`, `N800k`, `#350k`, `NGN 2.2M`, `650,000`, `7.5 million naira`, `1.5mil`. Fees such as caution, agency and legal are deprioritised in favour of the rent figure. |
| Period | per annum, yearly, `/yr`, monthly, per night |
| Bedrooms | `2 bedroom`, `3bed`, `3br`, `two bedroom`, `mini flat` and `room and parlour` (= 1), `self contain` and `studio` (= 0) |
| Area | About 120 Lagos, Ibadan and Abuja neighbourhoods, including hashtag forms like `#ajahapartments`. Falls back to the city. |
| Phone | `0803…`, `+234 803 …`, `wa.me/234…`, normalised to `+234…` and deduplicated. If the caption has none, the creator's bio is used. |

To recognise a new area, add it to `AREAS` in `parser.ts`. Stored listings are re-parsed whenever a later run finds them again.

## Project layout

```
src/
  app/                       pages (Search, Run, History, Settings) and /api route handlers
  components/                UI built from shadcn/ui primitives only
  lib/parser.ts              caption parsing (+ parser.test.ts)
  lib/runs.ts                run lifecycle, listing queries, CSV
  lib/scraper/               Scraper interface, Apify + mock providers
  lib/db.ts                  libSQL client + schema
  lib/settings.ts            token/defaults storage (token never sent to the client)
  proxy.ts                   optional APP_PASSWORD basic auth
```
