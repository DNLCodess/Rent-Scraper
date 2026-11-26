# TikTok Rentals

A personal rental-hunt app for Lagos, Ibadan and Abuja. Every morning it scrapes TikTok for house-for-rent videos, parses **price, area, bedrooms and phone/WhatsApp numbers** from captions and bios, scores them against your criteria, and puts the best in a mobile-first Inbox.

- **Inbox**: new listings as a swipeable reel or a grid. Dismiss, save, or open one.
- **Listing**: video cover, parsed details, and a prefilled WhatsApp link to the poster.
- **Tracker**: saved listings moved through stages (contacted, viewing, ... Got it).
- **My criteria**: budget, areas, bedrooms and blocked posters; hidden listings can be reopened.
- **Searches**: the hashtags/keywords scraped each day, plus run history and manual runs.

> **Notice:** scraping may breach TikTok's Terms of Service. The app only collects public data. You are responsible for how you use it.

## Local setup (mock mode)

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local
# in .env.local set: SCRAPER_PROVIDER=mock
pnpm dev        # http://localhost:3000
```

Mock mode returns sample videos without calling Apify (free). The default database is `file:data/app.db` (SQLite, created automatically). Open **Searches**, start a run, then check the Inbox.

Other scripts: `pnpm test`, `pnpm lint`, `pnpm build`.

## Real scraping (Apify)

1. Create an Apify account and copy your token from Apify Console, Settings, API & Integrations.
2. Put it in `.env.local` as `APIFY_TOKEN` and remove `SCRAPER_PROVIDER=mock`.
3. Optional: `APIFY_ACTOR` to use a different actor (default `clockworks~tiktok-scraper`).

Covers come from Apify's `videoMeta.coverUrl` (TikTok oEmbed no longer returns thumbnails).

## Environment variables

See `.env.example` for the full list: `APIFY_TOKEN`, `APIFY_ACTOR`, `SCRAPER_PROVIDER`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `APP_PASSWORD`, `CRON_SECRET`, `APIFY_WEBHOOK_SECRET`, `APP_URL`.

## Deploy to Vercel

1. Import the repo into Vercel.
2. Add a **Turso** database from the Vercel Marketplace. It sets `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.
3. Set `APIFY_TOKEN`, `APP_PASSWORD`, `CRON_SECRET`, `APIFY_WEBHOOK_SECRET` (any long random string) and `APP_URL` (your public URL, e.g. `https://your-app.vercel.app`).
4. Deploy. `vercel.json` registers the daily cron.

`APP_PASSWORD` turns on HTTP Basic auth for the whole app (any username, this password). Set it on any public deployment, otherwise strangers can spend your Apify credit.

All mutating `/api` calls (POST/PUT/PATCH/DELETE) must be same-origin and send JSON (`Origin` header matching the host, `Content-Type: application/json`). This is a CSRF guard, since Basic-auth credentials are sent cross-site by browsers. The cron and webhook routes are exempt and use their own secrets.

## Daily run and webhook

- **Cron:** `vercel.json` schedules `0 6 * * *` UTC, which is 07:00 in Lagos. It calls `/api/cron/daily`, which starts a run for each search marked daily. Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when `CRON_SECRET` is set; requests without it are rejected.
- **Webhook:** each Apify run is started with a webhook to `${APP_URL}/api/webhooks/apify?secret=${APIFY_WEBHOOK_SECRET}`. When the run finishes, Apify calls it and the app ingests the results.
- **Polling fallback:** the app also polls `/api/runs/:id` for in-progress runs, so a missed webhook (or no `APP_URL`) still results in ingestion.
- There is no background worker, so everything works on serverless hosting.

## Layout

- `src/lib/parser.ts`: regex and keyword extraction of price, area, bedrooms, phone.
- `src/lib/scraper/`: `Scraper` interface with `apify.ts` and `mock.ts` providers.
- `src/lib/ingest.ts`: deduplicates by TikTok video ID and stores listings.
- `src/proxy.ts`: CSRF guard and optional Basic auth.
- Storage: libSQL (local SQLite file, or Turso in production).
