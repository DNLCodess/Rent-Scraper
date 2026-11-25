# Rental Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the per-run TikTok scraper into a personal rental-hunting app: a ranked Inbox of new listings filtered by the owner's criteria, a tracker for WhatsApp → inspection → negotiation, daily automatic runs, and the agreed Lagoon & Brass mobile UI.

**Architecture:**
- **Domain modules:** pure modules in `src/lib/`:
  - `parser.ts` (extended): reads facts from captions.
  - `rules.ts`: hide and rank logic.
  - `whatsapp.ts`: message text and links.
  - `time.ts`: Lagos time helpers.
- **Data access modules** on libSQL: `preferences.ts`, `inbox.ts`, `listings.ts`, `tracker.ts`, `searches.ts`, plus the existing `runs.ts`.
- **API routes:** thin route handlers expose those modules.
- **Background work:** none runs as a server process. A daily Vercel cron starts Apify runs, and an Apify webhook ingests the results. Client pages call the routes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui (Base UI), libSQL (`@libsql/client`, Turso in prod), Vitest, Apify REST, lucide-react, sonner.

**Spec:** `docs/superpowers/specs/2026-11-25-rental-hunt-design.md` (read it first; section numbers below refer to it). Mockups: https://claude.ai/artifact/USZd2wUsbhWty9GZyJohnP (top row, "A · Reel — Lagoon & Brass").

## Global Constraints

- Next 16 conventions apply: read `node_modules/next/dist/docs/` before using a Next API. Use `proxy.ts`, not middleware. In route handlers, `params` is a Promise typed with `RouteContext<'/path'>`. Data reads in pages sit behind `<Suspense>`.
- Hosting: Vercel Hobby. No long-running processes. Cron runs once per day at most: `0 6 * * *` UTC = 07:00 Lagos.
- Database: libSQL via `db()` in `src/lib/db.ts`. Locally a `file:data/app.db` file; in prod `DATABASE_URL` + `DATABASE_AUTH_TOKEN` (Turso).
- Single user. Everything is behind `APP_PASSWORD`, except `/api/cron/daily` (header `Authorization: Bearer ${CRON_SECRET}`) and `/api/webhooks/apify` (query `?secret=${APIFY_WEBHOOK_SECRET}`).
- Unknown data must never trigger a hard rule (spec §2 anti-goal 1). Hard rules are exactly the six in spec §7 Inbox.
- Rent is the only price used for budget. `total_package_ngn` is only set when the caption states it; never compute it.
- Time zone for "this week", inspections, "new today" and cron: `Africa/Lagos`.
- Palette, type, spacing, touch, icon and radius values come verbatim from spec §9.
  - Font: Plus Jakarta Sans.
  - Primary `#0F4F55`.
  - Ground `#F2F5F4`.
  - Brass tag `#EBCF96` with text `#3D2A06`.
  - Spacing scale: 4/8/12/16/24/32/48 only.
  - Gutter 24.
  - Touch targets ≥48px.
  - Lightbulb icon for power, never a zap.
- Copy follows the mockups: plain, specific, no exclamation marks. Errors say what happened and what to do.
- Keep the `Scraper` interface. The mock provider (`SCRAPER_PROVIDER=mock`) must keep working for every flow.
- Commit after each task on branch `feat/rental-hunt` (never commit to `main`).

## Review Focus

1. **Unknown fields never hide a listing.** A caption with no price, no bedrooms or a city-only area must stay in the Inbox, tagged "Check manually", for every preference combination except `power_mode = require`. Task 4 pins this.
2. **Webhook delivered twice or after a poll already ingested the run.** It must not duplicate listings or reset statuses. A listing the owner already dismissed stays dismissed when a later run finds it again. Tasks 1 and 7 pin this.
3. **Times near midnight Lagos.** An inspection at 23:30 WAT counts in the right day and week, whatever the server's UTC clock says. Task 6 pins this.
4. **WhatsApp text with ₦, apostrophes and line breaks.** It must arrive intact. A listing with several phones uses the first. A listing with none offers "Open on TikTok" instead. Task 9 pins this.
5. **Batch actions over mixed statuses.** "Dismiss 3" when one of the three was already shortlisted elsewhere must only touch `new` listings and report how many changed. Task 5 pins this.

---

## File Structure

```
src/lib/
  db.ts            MODIFY  schema v2 + addColumnIfMissing + useTestDb
  parser.ts        MODIFY  power level, total package, area parents, highlights, yearlyRent
  time.ts          CREATE  Lagos time helpers
  preferences.ts   CREATE  preferences + blocked authors
  rules.ts         CREATE  pure hide/rank evaluation
  inbox.ts         CREATE  inbox + hidden queries
  listings.ts      CREATE  status transitions, batch, notes, got-it/reopen
  tracker.ts       CREATE  tracker view query
  whatsapp.ts      CREATE  prefilled messages + wa.me links
  searches.ts      CREATE  saved searches + daily run
  tiktok.ts        CREATE  oEmbed thumbnail lookup
  runs.ts          MODIFY  source column, ingest writes new fields, advanceRunByJobId
  scraper/apify.ts MODIFY  ad-hoc webhook on run start
  types.ts         MODIFY  shared DTO types for the new views
src/app/api/
  inbox/route.ts, inbox/hidden/route.ts
  listings/[id]/route.ts, listings/[id]/actions/route.ts, listings/batch/route.ts, listings/dismiss-where/route.ts
  tracker/route.ts
  preferences/route.ts, preferences/blocked/route.ts
  searches/route.ts, searches/[id]/route.ts, searches/[id]/run/route.ts
  cron/daily/route.ts, webhooks/apify/route.ts, cover/[id]/route.ts
src/app/
  layout.tsx (MODIFY), page.tsx (Inbox), listing/[id]/page.tsx, tracker/page.tsx,
  criteria/page.tsx, criteria/hidden/page.tsx, searches/page.tsx, searches/runs/[id]/page.tsx,
  manifest.ts
  DELETE: history/, settings/, runs/ (moved under searches)
src/components/
  app/tab-bar.tsx, app/screen-header.tsx, app/power-tag.tsx, app/cover.tsx
  inbox/reel.tsx, inbox/grid.tsx, inbox/listing-menu.tsx, inbox/caught-up.tsx
  listing/listing-detail.tsx, listing/caption.tsx
  tracker/tracker-view.tsx, tracker/book-inspection-sheet.tsx, tracker/log-inspection-sheet.tsx,
  tracker/drop-sheet.tsx, tracker/offer-sheet.tsx, tracker/got-it-sheet.tsx
  criteria/criteria-form.tsx, criteria/budget-card.tsx, criteria/area-chips.tsx
  searches/searches-view.tsx (absorbs search-form, settings-form; run-view moves here)
vitest.config.ts, vercel.json   CREATE
```

---

### Task 1: Schema v2 and test harness

**Files:**
- Create: `vitest.config.ts`, `src/lib/db.test.ts`
- Modify: `src/lib/db.ts`, `package.json` (no new deps)

**Interfaces:**
- Produces:
  - `db(): Promise<Client>` (unchanged).
  - `useTestDb(): Promise<Client>`: replaces the singleton with a fresh `file::memory:` client and applies the schema. Call it in `beforeEach`.
  - `addColumnIfMissing(c: Client, table: string, column: string, ddl: string): Promise<void>`.
- Columns added to `listings` (spec §5):
  - `status TEXT NOT NULL DEFAULT 'new'`, `status_changed_at TEXT`, `first_seen_at TEXT`, `drop_reason TEXT`.
  - `power_level TEXT NOT NULL DEFAULT 'unknown'`, `power_raw TEXT`.
  - `total_package_ngn INTEGER`.
  - `inspection_at TEXT` (ISO with offset), `offer_ngn INTEGER`, `counter_ngn INTEGER`.
  - `power_confirmed TEXT`, `replied_at TEXT`, `archived INTEGER NOT NULL DEFAULT 0`, `prev_status TEXT`.
- Column added to `runs`: `source TEXT NOT NULL DEFAULT 'manual'`.
- New tables:
  - `notes(id TEXT PK, listing_id TEXT, body TEXT, created_at TEXT)`
  - `preferences(key TEXT PK, value TEXT)` (JSON values)
  - `blocked_authors(handle TEXT PK, blocked_at TEXT)`
  - `saved_searches(id TEXT PK, terms TEXT /*JSON*/, count INTEGER, daily INTEGER, created_at TEXT)`
- Backfill: `first_seen_at` defaults to `updated_at` for existing rows.

- [ ] **Step 1:** Create branch: `git checkout -b feat/rental-hunt`.
- [ ] **Step 2:** Create `vitest.config.ts`:
  - alias `server-only` → an empty module (`src/test/empty.ts`);
  - alias `@` → `src`;
  - `environment: "node"`.
- [ ] **Step 3: Write failing tests** in `src/lib/db.test.ts`:
  - `it("adds v2 listing columns")`: `PRAGMA table_info(listings)` names include every column above.
  - `it("is idempotent")`: calling migrate twice does not throw.
  - `it("defaults status to new and power_level to unknown")`: insert a minimal listing row; read back `status === "new"`, `power_level === "unknown"`, `archived === 0`.
- [ ] **Step 4:** Run `pnpm test src/lib/db.test.ts`. Expected: FAIL (`useTestDb` not exported).
- [ ] **Step 5:** Implement in `db.ts`:
  - keep the `SCHEMA` list for tables;
  - add a `migrate(c)` that runs it plus `addColumnIfMissing` calls (via `PRAGMA table_info`) and the backfill `UPDATE`;
  - `ready` awaits `migrate`;
  - add `useTestDb`.
- [ ] **Step 6:** Run `pnpm test`. Expected: all pass, including the existing 48 parser tests.
- [ ] **Step 7:** Commit: `git add -A && git commit -m "feat(db): schema v2 for listing statuses, preferences, saved searches"`.

### Task 2: Parser additions

**Files:**
- Modify: `src/lib/parser.ts`, `src/lib/parser.test.ts`

**Interfaces:**
- Produces:
  - `type PowerLevel = "strong" | "mentioned" | "unknown"`
  - `parsePower(text: string): { level: PowerLevel; raw: string | null }`
  - `parseTotalPackage(text: string): number | null`
  - `yearlyRent(ngn: number | null, period: PricePeriod | null): number | null`: year or null → `ngn`; month → `ngn * 12`; night → `null`.
  - `areaLineage(area: string): string[]`: the area followed by its ancestors, e.g. `areaLineage("Lekki Phase 1") → ["Lekki Phase 1", "Lekki"]`.
  - `isCity(area: string): boolean`
  - `findHighlights(caption: string): Array<{ start: number; end: number }>`: spans for the price, period phrase, area, bedrooms, power phrase, total package and phones. Sorted, non-overlapping.
  - `ParsedListing` gains `power_level`, `power_raw`, `total_package_ngn`.
- Parent links (`AREA_PARENTS`), at minimum:
  - Lekki Phase 1, Lekki Phase 2, Ikate, Agungi, Osapa, Jakande, Chevron, Ikota → Lekki;
  - Ikeja GRA, Allen Avenue, Opebi, Alausa, Oregun → Ikeja;
  - Banana Island, Parkview → Ikoyi;
  - Ibeju-Lekki has **no** parent.

- [ ] **Step 1: Write failing tests** (append to `parser.test.ts`):
  - `parsePower`, as `it.each`:
    - "24/7 light, Band A" → strong
    - "24hrs power" → strong
    - "constant light" → strong
    - "estate power" → strong
    - "dedicated transformer" → strong
    - "prepaid meter" → mentioned
    - "solar and inverter" → mentioned
    - "Beautiful flat" → unknown, `raw` null
    - "Band A" in "Band Aid"? → unknown (word-bounded)
  - `parseTotalPackage`:
    - "Total package ₦1.95m" → 1_950_000
    - "package: 2.2m" → 2_200_000
    - "total: ₦2m" → 2_000_000
    - "Rent 1.5m, agency 10%, legal 10%" → null
  - `yearlyRent`:
    - (1_500_000, "year") → 1_500_000
    - (150_000, "month") → 1_800_000
    - (85_000, "night") → null
    - (800_000, null) → 800_000
    - (null, "year") → null
  - `areaLineage`:
    - "Lekki Phase 1" → ["Lekki Phase 1", "Lekki"]
    - "Ibeju-Lekki" → ["Ibeju-Lekki"]
    - "Yaba" → ["Yaba"]
  - `isCity`: "Lagos" → true, "Yaba" → false.
  - `findHighlights`: for "2 bedroom flat in Yaba, 24/7 light. Rent ₦1.5m per annum", the texts sliced at the returned spans equal `["2 bedroom", "Yaba", "24/7 light", "₦1.5m"]` in order (the period may extend the price span: assert it contains "₦1.5m").
  - `parseListing("…Total package ₦1.95m…")` includes `total_package_ngn: 1_950_000`, and the rent is unchanged by the package figure. "Rent 1.5m … Total package 1.95m" → `price_ngn` 1_500_000.
- [ ] **Step 2:** Run `pnpm test src/lib/parser.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement each function in `parser.ts`. `parsePrice` must give "total"/"package" a fee-like penalty so rent wins: move `total` out of `RENT_HINT` into a new `PACKAGE_HINT` penalty.
- [ ] **Step 4:** Run `pnpm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(parser): power level, total package, area lineage, highlights`.

### Task 3: Preferences and blocked agents

**Files:**
- Create: `src/lib/preferences.ts`, `src/lib/preferences.test.ts`, `src/app/api/preferences/route.ts`, `src/app/api/preferences/blocked/route.ts`

**Interfaces:**
- Produces:
  - `type BedOption = "0" | "1" | "2" | "3" | "4+"`
  - `type PowerMode = "ignore" | "rank" | "require"`
  - `interface Preferences`:
    - `budgetMin: number | null`
    - `budgetMax: number | null`
    - `beds: BedOption[]`
    - `preferredAreas: string[]`
    - `excludedAreas: string[]`
    - `powerMode: PowerMode`
    - `nudgeDays: number`
    - `huntState: "active" | "done"`
  - `DEFAULT_PREFERENCES`: nulls, `beds: []` (empty = any), `powerMode: "rank"`, `nudgeDays: 3`, `huntState: "active"`.
  - `getPreferences(): Promise<Preferences>`
  - `updatePreferences(patch: Partial<Preferences>): Promise<Preferences>`: validates and throws `InputError` (from `runs.ts`) on bad input.
  - `blockAuthor(handle: string): Promise<void>`, `unblockAuthor(handle: string): Promise<void>`
  - `listBlocked(): Promise<Array<{ handle: string; blockedAt: string; hiddenCount: number }>>`
  - `blockedSet(): Promise<Set<string>>`
- Routes:
  - `GET/PUT /api/preferences` → `Preferences`.
  - `GET /api/preferences/blocked`, `POST {handle}`, `DELETE ?handle=`.

- [ ] **Step 1: Write failing tests** (each uses `useTestDb()`):
  - `it("returns defaults on a fresh db")` → `toEqual(DEFAULT_PREFERENCES)`.
  - `it("persists a partial update")`: `updatePreferences({ budgetMax: 2_000_000 })` then `getPreferences().budgetMax === 2_000_000` and `powerMode === "rank"`.
  - `it("rejects min above max")`: `{ budgetMin: 3e6, budgetMax: 2e6 }` → rejects with `InputError`.
  - `it("normalises area names to the parser's canonical names")`: `{ excludedAreas: ["ajah"] }` → `["Ajah"]`. Unknown names are kept as typed.
  - `it("blocks case-insensitively without the @")`: `blockAuthor("@LekkiLiving")` then `blockedSet().has("lekkiliving")`.
  - `it("counts posts hidden per blocked agent")`: insert 2 listings by that author → `hiddenCount === 2`.
- [ ] **Step 2:** Run `pnpm test src/lib/preferences.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Store each key as JSON in `preferences`. Canonicalise area names by matching against the parser's known area names case-insensitively.
- [ ] **Step 4:** Implement both route files (thin; reuse `errorResponse` from `src/lib/api/respond.ts`).
- [ ] **Step 5:** Run `pnpm test && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 6:** Commit: `feat: preferences and blocked agents`.

### Task 4: Rules engine and Inbox queries

**Files:**
- Create: `src/lib/rules.ts`, `src/lib/rules.test.ts`, `src/lib/inbox.ts`, `src/lib/inbox.test.ts`, `src/app/api/inbox/route.ts`, `src/app/api/inbox/hidden/route.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: `Preferences`, `blockedSet()` (Task 3); `yearlyRent`, `areaLineage`, `isCity` (Task 2).
- Produces (`rules.ts`, pure):
  - `type HideReason = "excluded_area" | "blocked_author" | "over_budget" | "under_budget" | "bedrooms" | "shortlet" | "power_required"`
  - `interface RuleInput { author: string; area: string | null; price_ngn: number | null; price_period: PricePeriod | null; bedrooms: number | null; power_level: PowerLevel; posted_at: string | null; first_seen_at: string }`
  - `interface Evaluation { hiddenBy: HideReason | null; score: number; checkManually: boolean; probablyTaken: boolean }`
  - `evaluate(l: RuleInput, prefs: Preferences, blocked: Set<string>, now: Date): Evaluation`
  - `STRONG_MATCH_MAX = 3`
  - `STALE_DAYS = 21`
- Produces (`types.ts`):
  - `interface InboxItem extends Listing { status: ListingStatus; power_level: PowerLevel; total_package_ngn: number | null; first_seen_at: string; checkManually: boolean; probablyTaken: boolean; strongMatch: boolean }`
  - `type ListingStatus = "new" | "dismissed" | "shortlisted" | "messaged" | "inspection_booked" | "inspected" | "negotiating" | "got_it" | "dropped"`
  - `interface InboxResponse { items: InboxItem[]; newToday: number; matchCount: number; hiddenCount: number }`
- Produces (`inbox.ts`):
  - `getInbox(now?: Date): Promise<InboxResponse>`: `status='new' AND archived=0`. Hidden listings are excluded. Sort: complete before check-manually, then `score` desc, then `first_seen_at` desc. Mark the top `STRONG_MATCH_MAX` complete items whose score ≥ `STRONG_MATCH_SCORE` as `strongMatch`.
  - `getHidden(): Promise<Array<{ item: InboxItem; reason: HideReason }>>`
- Scoring (my values, tunable):
  - +40 preferred area (lineage match);
  - with `powerMode = "rank"`: +30 for strong power, +15 for mentioned;
  - +20 if the yearly rent is within budget;
  - +0–10 freshness (10 if seen within 24h, decaying to 0 at 7 days).
  - `STRONG_MATCH_SCORE = 70`.
- Routes:
  - `GET /api/inbox` → `InboxResponse`
  - `GET /api/inbox/hidden`

- [ ] **Step 1: Write failing tests** in `rules.test.ts`. Use a `base` RuleInput (Yaba, ₦1.5m/year, 2 beds, unknown power, fresh) and prefs `{budgetMax: 2e6, beds: ["1","2"], excludedAreas: ["Lekki"], preferredAreas: ["Yaba"]}`.
  - `it.each` for hiddenBy:
    - area "Lekki Phase 1" → excluded_area
    - area "Ibeju-Lekki" → null
    - author in blocked → blocked_author
    - ₦2.5m/year → over_budget
    - ₦150k/month (= 1.8m) → null
    - ₦200k/month (= 2.4m) → over_budget
    - ₦85k/night → shortlet
    - 3 beds → bedrooms
    - bedrooms null → null
    - price null → null
    - area null → null
    - area "Lagos" (city) → null
    - `powerMode: "require"` + unknown → power_required
  - `it("never hides on unknown fields")`: loop over every combination of price/area/bedrooms being null, with each `powerMode` except `require` → `hiddenBy === null` (Review Focus 1).
  - `checkManually`: true when price null, or bedrooms null, or area null or a city. False for `base`.
  - `probablyTaken`: posted 22 days ago → true; 20 days → false; posted_at null and first_seen 22 days ago → true.
  - `score`: preferred area > non-preferred, all else equal. With `powerMode: "ignore"`, power doesn't change the score.
- [ ] **Step 2:** In `inbox.test.ts` (with `useTestDb` + helper `insertListing(partial)`):
  - `getInbox` excludes dismissed, archived and hidden listings, and orders check-manually items last.
  - `strongMatch` is true for at most 3 items.
  - `newToday` counts `first_seen_at` within the last 24h.
  - `hiddenCount + matchCount` equals the count of `status='new'` non-archived listings.
- [ ] **Step 3:** Run `pnpm test src/lib/rules.test.ts src/lib/inbox.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement `rules.ts` and `inbox.ts`. Filter in TypeScript after one SQL read: data is small, at most a few thousand rows.
- [ ] **Step 5:** Implement both routes.
- [ ] **Step 6:** Run `pnpm test && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 7:** Commit: `feat: inbox rules, ranking and queries`.

### Task 5: Listing actions, batch actions and notes

**Files:**
- Create: `src/lib/listings.ts`, `src/lib/listings.test.ts`, `src/app/api/listings/[id]/route.ts`, `src/app/api/listings/[id]/actions/route.ts`, `src/app/api/listings/batch/route.ts`, `src/app/api/listings/dismiss-where/route.ts`

**Interfaces:**
- Consumes: `ListingStatus`, `InboxItem` (Task 4); `blockAuthor` (Task 3).
- Produces:
  - `type DropReason = "too_expensive" | "bad_area" | "agent_ghosted" | "fake_listing" | "taken" | "other"`
  - `type ListingAction`, one of:
    - `{type:"dismiss"}`
    - `{type:"shortlist"}`
    - `{type:"messaged"}`
    - `{type:"replied"}`
    - `{type:"book_inspection"; at:string /*ISO with offset*/}`
    - `{type:"log_inspection"; powerConfirmed:string; note?:string; next:"negotiating"|"dropped"; dropReason?:DropReason}`
    - `{type:"offer"; offer:number|null; counter:number|null}`
    - `{type:"drop"; reason:DropReason}`
    - `{type:"got_it"}`
    - `{type:"undo"}` (restores `prev_status`)
  - `applyAction(id: string, action: ListingAction, now?: Date): Promise<ListingDetail>`: throws `InputError` on an illegal transition.
  - `batchAction(ids: string[], type: "dismiss" | "shortlist"): Promise<{ changed: number }>`: only rows with `status='new'`.
  - `dismissWhere(by: { author: string } | { area: string }): Promise<{ changed: number }>`: area matching uses lineage.
  - `addNote(id: string, body: string): Promise<Note>`
  - `getListing(id: string): Promise<ListingDetail | null>`, where `ListingDetail = InboxItem & { notes: Note[]; inspection_at; offer_ngn; counter_ngn; power_confirmed; replied_at; drop_reason; highlights: Array<{start:number;end:number}> }`.
  - `reopenHunt(): Promise<void>`
- Transition table (`ALLOWED`):
  - new → dismissed | shortlisted | messaged
  - shortlisted → messaged | dropped | dismissed
  - messaged → inspection_booked | dropped (`replied` allowed while messaged)
  - inspection_booked → inspected | dropped (re-booking allowed)
  - inspected → negotiating | dropped
  - negotiating → got_it | dropped (`offer` allowed while negotiating)
- Every status change sets `prev_status`, `status_changed_at`.
- `got_it`: sets `preferences.huntState="done"`, and sets `archived=1` on every listing in shortlisted…negotiating except this one.
- `reopenHunt`: `archived=0` for all, `huntState="active"`.
- Routes:
  - `GET /api/listings/[id]`, `POST /api/listings/[id]/actions` (body = `ListingAction`), `POST /api/listings/batch` `{ids,type}`, `POST /api/listings/dismiss-where` `{author}|{area}`.
  - Note creation: `POST /api/listings/[id]` `{note}`.

- [ ] **Step 1: Write failing tests:**
  - new → shortlist → messaged → book (at) → inspected via log_inspection(next negotiating) → offer → got_it. Assert each status, plus `offer_ngn` and `power_confirmed` persisted.
  - `it("rejects skipping stages")`: new → `log_inspection` rejects `InputError`.
  - `it("undo restores previous status")`: messaged then undo → `shortlisted` (or `new`).
  - `it("replied stops nudge eligibility")`: `replied_at` set; status still messaged.
  - `batchAction(["a","b","c"], "dismiss")` where b is shortlisted → `{changed: 2}` and b still shortlisted (Review Focus 5).
  - `dismissWhere({area:"Lekki"})` dismisses Lekki Phase 1 listings, not Ibeju-Lekki.
  - got_it archives the other active tracker listings; `reopenHunt` restores them with the same statuses.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement `listings.ts` and the routes.
- [ ] **Step 4:** Run `pnpm test && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit: `feat: listing actions, batch dismiss/shortlist, notes, got-it`.

### Task 6: Tracker query and Lagos time

**Files:**
- Create: `src/lib/time.ts`, `src/lib/time.test.ts`, `src/lib/tracker.ts`, `src/lib/tracker.test.ts`, `src/app/api/tracker/route.ts`

**Interfaces:**
- Produces (`time.ts`):
  - `LAGOS_TZ = "Africa/Lagos"`
  - `lagosDayKey(d: Date): string` (YYYY-MM-DD in Lagos)
  - `startOfLagosDay(d: Date): Date`
  - `formatLagos(d: Date, style: "date" | "time" | "dayShort" | "dayNum"): string`
- Produces (`tracker.ts`):
  - `type TrackerStage = "shortlisted" | "messaged" | "inspection_booked" | "inspected" | "negotiating"`
  - `interface TrackerView { activeCount: number; thisWeek: { inspections: ListingDetail[]; nudges: ListingDetail[] }; stages: Record<TrackerStage, ListingDetail[]> }`
  - `getTracker(now?: Date): Promise<TrackerView>`
    - inspections: `inspection_booked` with `inspection_at` from start of today (Lagos) to +7 days, ascending.
    - nudges: `messaged`, `replied_at` null, `status_changed_at` older than `nudgeDays`.
    - Archived rows are excluded.
- Route: `GET /api/tracker`.

- [ ] **Step 1: Write failing tests:**
  - `lagosDayKey(new Date("2026-11-28T22:30:00Z"))` → `"2026-11-28"` (23:30 WAT).
  - `lagosDayKey(new Date("2026-11-28T23:30:00Z"))` → `"2026-11-29"` (Review Focus 3).
  - Tracker:
    - an inspection at 2026-11-29T10:00+01:00 with now = 2026-11-25 is in `thisWeek.inspections`;
    - one at 2026-12-03 is not;
    - an inspection earlier today (Lagos) still shows.
  - Nudges:
    - messaged 4 days ago with nudgeDays 3 → included;
    - 2 days → not;
    - replied → not.
  - `activeCount` counts the five stages.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement with `Intl.DateTimeFormat("en-GB", { timeZone: LAGOS_TZ, … })` (no new deps).
- [ ] **Step 4:** Run `pnpm test`. Expected: pass.
- [ ] **Step 5:** Commit: `feat: tracker view and Lagos time helpers`.

### Task 7: Saved searches, daily cron and Apify webhook

**Files:**
- Create: `src/lib/searches.ts`, `src/lib/searches.test.ts`, `src/app/api/searches/route.ts`, `src/app/api/searches/[id]/route.ts`, `src/app/api/searches/[id]/run/route.ts`, `src/app/api/cron/daily/route.ts`, `src/app/api/webhooks/apify/route.ts`, `vercel.json`
- Modify:
  - `src/lib/runs.ts`: `createRun(rawTags, rawCount, source: "manual" | "scheduled" = "manual")`.
  - `src/lib/runs.ts`: export `advanceRunByJobId(jobId: string): Promise<Run | null>` (finds the run whose `jobs` JSON contains the jobId, then `advanceRun`).
  - `src/lib/runs.ts`: `ingest` writes `power_level`, `power_raw`, `total_package_ngn`, and `first_seen_at` on insert only. **It never touches `status` or tracker columns on conflict.**
  - `src/lib/scraper/apify.ts`: when `APP_URL` and `APIFY_WEBHOOK_SECRET` are set, `start()` appends `&webhooks=<base64 JSON>`. The webhook is for events `ACTOR.RUN.SUCCEEDED`, `ACTOR.RUN.FAILED`, `ACTOR.RUN.TIMED_OUT`, `ACTOR.RUN.ABORTED`, with `requestUrl: ${APP_URL}/api/webhooks/apify?secret=${APIFY_WEBHOOK_SECRET}`. Verify the parameter name against https://docs.apify.com/api/v2/act-runs-post before relying on it.
  - `src/proxy.ts`: skip auth for `/api/cron/` and `/api/webhooks/`.
  - `.env.example`: add `CRON_SECRET`, `APIFY_WEBHOOK_SECRET`, `APP_URL`.

**Interfaces:**
- Produces:
  - `interface SavedSearch { id: string; terms: string[]; count: number; daily: boolean; createdAt: string }`
  - `listSearches()`, `createSearch(input: { terms: string[]; count: number; daily: boolean })`, `updateSearch(id, patch)`, `deleteSearch(id)`
  - `runSavedSearch(id): Promise<Run>`
  - `runDailySearches(): Promise<{ started: string[] }>`: does nothing when `huntState === "done"`.
  - On first use, seed one search from the legacy `default_tags` setting if no saved searches exist.
- Cron route:
  - `GET` with `Authorization: Bearer ${CRON_SECRET}` → 200 `{started}`; else 401.
  - `vercel.json`: `{ "crons": [{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }] }`.
- Webhook route:
  - `POST ?secret=`; wrong secret → 401.
  - Body `resource.id` = Apify run id → `advanceRunByJobId`.
  - Always 200 on a known secret, so Apify doesn't retry forever.

- [ ] **Step 1: Write failing tests** (`searches.test.ts`, mock provider via `process.env.SCRAPER_PROVIDER = "mock"`):
  - create/list/update/delete round-trip; `count` outside 1–100 → `InputError`.
  - `runDailySearches` starts one run per `daily` search with `source: "scheduled"`, and none when `huntState` is `done`.
  - `advanceRunByJobId` on an unknown id → null.
  - Calling `advanceRunByJobId` twice after the mock job finishes leaves the same listing count (Review Focus 2). Use `vi.useFakeTimers()` / `vi.setSystemTime` to move past the mock's 8s duration.
  - A listing set to `dismissed` (and one set to `negotiating` with `offer_ngn`) before a second run re-finds it keeps its status and tracker fields after ingest (Review Focus 2).
  - Cron handler: call the exported `GET` with and without the header → 401 / 200.
  - Webhook handler: wrong secret → 401.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the modules, routes and `vercel.json`, and modify `runs.ts`, `apify.ts`, `proxy.ts`.
- [ ] **Step 4:** Run `pnpm test && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit: `feat: saved searches, daily cron and Apify webhook ingest`.

### Task 8: Covers via TikTok oEmbed

**Files:**
- Create: `src/lib/tiktok.ts`, `src/lib/tiktok.test.ts`, `src/app/api/cover/[id]/route.ts`

**Interfaces:**
- Produces:
  - `fetchThumbnail(videoUrl: string, fetchImpl?: typeof fetch): Promise<string | null>`: GET `https://www.tiktok.com/oembed?url=<encoded>`, returns `thumbnail_url`. Results are cached in memory for 30 min.
  - `embedUrl(videoId: string): string` → `https://www.tiktok.com/embed/v2/${videoId}`
  - `GET /api/cover/[id]`: 302 to the thumbnail with `Cache-Control: public, max-age=1800`; 404 when the listing or thumbnail is missing.

- [ ] **Step 1: Write failing tests** with a stubbed `fetchImpl`:
  - returns `thumbnail_url` from a 200 JSON;
  - returns null on 404 or invalid JSON;
  - calls fetch once for two calls with the same URL (cache);
  - `embedUrl("123")` exact string.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the module and route.
- [ ] **Step 4:** Run `pnpm test`. Expected: pass. Then, manually with the dev server, `curl -sI localhost:3000/api/cover/<a real scraped id>` should return 302. If TikTok blocks oEmbed, note it and leave the placeholder fallback in place.
- [ ] **Step 5:** Commit: `feat: TikTok cover thumbnails via oEmbed`.

### Task 9: WhatsApp messages

**Files:**
- Create: `src/lib/whatsapp.ts`, `src/lib/whatsapp.test.ts`

**Interfaces:**
- Produces:
  - `firstMessage(l: { bedrooms: number | null; area: string | null; price_ngn: number | null; price_period: PricePeriod | null }): string`
  - `nudgeMessage(l): string`
  - `waLink(phones: string | null, text: string): string | null`: uses the first phone, digits only, `https://wa.me/<digits>?text=<encodeURIComponent(text)>`; null when there is no phone.
- Copy (spec §7, exact):
  - first message: `Hi, is the {beds} in {area} ({price}) from your TikTok still available? What's the power situation — which band and how many hours a day?`
    - `{beds}` is "2-bed" / "mini flat" (1) / "studio" (0) / "place" (null).
    - `{area}` defaults to "the area" when null.
    - `{price}` uses `formatPrice` (e.g. "₦1.5m/yr"). Drop the parenthesis when there is no price.
  - nudge: `Hi again, following up on the {beds} in {area}. Is it still available?`

- [ ] **Step 1: Write failing tests:**
  - exact `firstMessage` for 2-bed Yaba ₦1.5m/yr;
  - null price omits the parenthesis;
  - `waLink("+2348031234567, +2347031234567", "Hi ₦1.5m — what's")` → starts `https://wa.me/2348031234567?text=`, and `decodeURIComponent` of the query equals the text (Review Focus 4);
  - `waLink(null, "x") === null`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement `whatsapp.ts`.
- [ ] **Step 4:** Run `pnpm test`. Expected: pass.
- [ ] **Step 5:** Commit: `feat: WhatsApp message templates and links`.

### Task 10: Design system shell

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/button.tsx` (variants only)
- Create: `src/components/app/tab-bar.tsx`, `src/components/app/screen-header.tsx`, `src/components/app/power-tag.tsx`, `src/components/app/cover.tsx`, `src/app/manifest.ts`
- Delete: `src/components/site-header.tsx`, `src/components/nav-links.tsx`, `src/lib/nav.ts`

**Interfaces:**
- Produces:
  - CSS tokens in `:root`, with the spec §9 values verbatim:
    - colours: `--ground`, `--surface`, `--subtle`, `--line`, `--line-strong`, `--text`, `--text-2`, `--text-3`, `--primary`, `--primary-tint`, `--brass`, `--brass-ink`, `--brass-highlight`, `--good`, `--good-tint`, `--good-ink`, `--needs`, `--needs-tint`, `--needs-ink`, `--cover`;
    - shadcn variables mapped to them (`--background: var(--ground)`, `--primary`, `--ring: var(--primary)`, `--radius: 1rem`).
  - Light theme only (spec non-goal): remove the dark media block.
  - Font: `Plus_Jakarta_Sans` via `next/font/google` as `--font-sans`.
  - `<TabBar active="inbox"|"tracker"|"searches"|"criteria" newCount={number} />`: fixed bottom, white, top border `--line`, items ≥48px, `padding-bottom: calc(32px + env(safe-area-inset-bottom))`, badge in `--primary`.
  - `<ScreenHeader title subtitle? right? />`: padding `calc(24px + env(safe-area-inset-top)) 24px 24px`, title 28/800.
  - `<PowerTag level label />`: brass tag with the lucide `Lightbulb` icon. Renders nothing for `unknown`.
  - `<Cover listingId className />`: `<img src="/api/cover/{id}">` on `--cover` with a placeholder play icon on error.
  - App frame: `max-width: 480px; margin: 0 auto` on `body > main` (mobile-first; centred column on desktop).
  - `manifest.ts`: name "Rental Hunt", `theme_color "#0F4F55"`, `background_color "#F2F5F4"`, `display "standalone"`.

- [ ] **Step 1:** Implement the tokens, font, layout, components and manifest.
- [ ] **Step 2:** Run `npx tsc --noEmit && pnpm lint && pnpm build`. Expected: clean.
- [ ] **Step 3:** Visual check with `pnpm dev` at 390×844 against the mockups: tab bar, header spacing and font render. Fix any deviations.
- [ ] **Step 4:** Commit: `feat(ui): Lagoon & Brass design system shell`.

### Task 11: Inbox screen (reel, grid, menu, caught up)

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/inbox/reel.tsx`, `src/components/inbox/grid.tsx`, `src/components/inbox/listing-menu.tsx`, `src/components/inbox/caught-up.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/inbox` → `InboxResponse`
  - `POST /api/listings/[id]/actions`, `POST /api/listings/batch`, `POST /api/listings/dismiss-where`, `POST /api/preferences/blocked`
  - `Cover`, `PowerTag`, `ScreenHeader`, `TabBar`
- Behaviour (mockups "A · Inbox (reel)" and "A · Inbox (grid, selecting)"):
  - Header "Inbox", with subtitle "**{newToday} new** · best match first". View toggle remembered in `localStorage` (guarded with try/catch).
  - **Reel:**
    - one card, cover fills it, bottom scrim;
    - facts in two groups (price 36/800 + "/ year", title 18/700 | PowerTag + "Posted {age}", @handle 13);
    - "Strong match" white tag; "Check manually" / "Probably taken" tags (coral tint for probably taken);
    - ⋯ opens `listing-menu`: Dismiss all from @agent, Dismiss all in {area} (only when area known), Block @agent;
    - Dismiss (64px outline) + Shortlist (primary pill);
    - horizontal swipe: left = dismiss, right = shortlist (threshold ~96px, with an animation; respects `prefers-reduced-motion`);
    - every action shows a sonner toast with **Undo** (`{type:"undo"}`);
    - tapping the card goes to `/listing/[id]`.
  - **Grid:**
    - 2 columns, tile 244px tall, gap 12, gutter 24;
    - tap toggles selection (ring = 3px ground gap + 2px primary, check badge);
    - quick-select chips: up to 2 top authors, up to 2 top areas, "No price", "Over 3 weeks";
    - header switches to Cancel / "{n} selected" / Select all;
    - bottom bar "Dismiss {n} / Shortlist {n}" replaces the tab bar while selecting.
  - **Caught up** (`items.length === 0`): calm message "You're all caught up", the next daily run time ("Next search 7:00 tomorrow"), and a link to Searches. When `huntState==="done"`, the message is "Hunt finished".

- [ ] **Step 1:** Implement the components and page. Client components fetch on mount with skeletons (`Skeleton`) and an inline error with Retry.
- [ ] **Step 2:** Run `npx tsc --noEmit && pnpm lint`. Expected: clean.
- [ ] **Step 3:** Manual check with `SCRAPER_PROVIDER=mock`: run a search, then:
  - shortlist one card, undo it, dismiss one;
  - select 3 in the grid and dismiss them, and the count drops by 3;
  - "Dismiss all in Yaba" removes the Yaba cards;
  - empty the Inbox and see Caught up.
  Compare with the mockups at 390×844.
- [ ] **Step 4:** Commit: `feat(ui): inbox reel and grid with batch actions`.

### Task 12: Listing detail screen

**Files:**
- Create: `src/app/listing/[id]/page.tsx`, `src/components/listing/listing-detail.tsx`, `src/components/listing/caption.tsx`

**Interfaces:**
- Consumes: `GET /api/listings/[id]` → `ListingDetail`; `applyAction` route; `firstMessage`, `waLink` (Task 9); `embedUrl` (Task 8).
- Behaviour (mockup "A · Listing"):
  - Video area 360px: cover; tapping play swaps in an `<iframe src={embedUrl(id)} allow="encrypted-media" />`. If the embed fails, show "Open on TikTok". White circular back and ⋯ buttons, 24px below the safe area.
  - White sheet, in this order:
    1. rent 36/800 + "/ year rent" (or "/ month");
    2. "Total package **₦X** · from the caption" only when set;
    3. h1 title 20/700;
    4. facts row (PowerTag, beds with `BedDouble` icon, age with `Clock`) between hairlines;
    5. "From the caption" with `<mark>` on `highlights` (bg `--brass-highlight`);
    6. agent row (initial avatar, handle, phone, copy button).
  - Notes list and an "Add note" input below the agent row.
  - Bottom bar: Shortlist icon button + primary **Message on WhatsApp**:
    - opens `waLink(phone, firstMessage(l))` in a new tab;
    - then applies `messaged` (only from `new`/`shortlisted`) with an Undo toast.
  - No phone → primary becomes "Open on TikTok" (Review Focus 4).

- [ ] **Step 1:** Implement the page and components.
- [ ] **Step 2:** Run `npx tsc --noEmit && pnpm lint`. Expected: clean.
- [ ] **Step 3:** Manual check with mock data:
  - highlights match the parsed facts;
  - the WhatsApp link opens with the exact prefilled text;
  - status becomes Messaged, and Undo reverts it;
  - a listing with no phone shows "Open on TikTok".
- [ ] **Step 4:** Commit: `feat(ui): listing detail with caption evidence and WhatsApp`.

### Task 13: Tracker screen and sheets

**Files:**
- Create: `src/app/tracker/page.tsx`, `src/components/tracker/tracker-view.tsx`, `book-inspection-sheet.tsx`, `log-inspection-sheet.tsx`, `drop-sheet.tsx`, `offer-sheet.tsx`, `got-it-sheet.tsx` (all under `src/components/tracker/`)

**Interfaces:**
- Consumes: `GET /api/tracker` → `TrackerView`; actions route; `nudgeMessage`, `waLink`; `formatLagos`.
- Behaviour (mockup "A · Tracker"):
  - Header "Tracker", subtitle "**{activeCount} active** · {n} inspection(s) this week".
  - Stage tabs (All · Shortlisted · Messaged · Inspecting · Negotiating) with counts; the active tab is primary-filled.
  - "This week" section:
    - inspection cards: primary date block "SAT / 29", "Inspection · 10:00", title, "₦1.5m/yr · @handle", Message (outline) + Log inspection (primary);
    - nudge cards: coral-tint clock icon, "No reply in {n} days", Nudge (opens `waLink(nudgeMessage)`), plus "Agent replied" as a secondary action.
  - Per-stage lists: row with a 48×64 cover thumbnail, title 16/700, stage-specific second line:
    - Messaged: "replied yesterday" / "messaged today"
    - Negotiating: "Asking ₦X · **your offer ₦Y**"
  - Row ⋯ / swipe actions: Book inspection (Messaged), Drop (any).
  - Sheets (shadcn `Sheet`, side bottom):
    - Book: date + time inputs, Lagos time.
    - Log inspection: "How was the power?" text, note, buttons Negotiate / Drop.
    - Drop: one-tap reasons.
    - Offer: two money inputs accepting `6.8m`. Reuse `parseAmount` from `src/lib/filters.ts`.
    - Got it: confirmation copy "Mark this as your new place? Your other listings will be archived and daily searches paused." with **Got it** / Cancel.
  - Got it is offered on Negotiating rows.

- [ ] **Step 1:** Implement the page, view and sheets.
- [ ] **Step 2:** Run `npx tsc --noEmit && pnpm lint`. Expected: clean.
- [ ] **Step 3:** Manual check: take one mock listing through shortlist → messaged → book (tomorrow 10:00) → log (power text) → offer → got it. Each screen updates, and the Inbox shows "Hunt finished" with no badge. Then reopen from My criteria (Task 14) and everything returns.
- [ ] **Step 4:** Commit: `feat(ui): tracker with inspections, nudges and negotiation`.

### Task 14: My criteria and See hidden

**Files:**
- Create: `src/app/criteria/page.tsx`, `src/app/criteria/hidden/page.tsx`, `src/components/criteria/criteria-form.tsx`, `budget-card.tsx`, `area-chips.tsx` (under `src/components/criteria/`)

**Interfaces:**
- Consumes: `GET/PUT /api/preferences`, blocked routes, `GET /api/inbox` (match/hidden counts, prices for the histogram), `GET /api/inbox/hidden`; `reopenHunt()` (Task 5). Add `POST /api/preferences` with body `{reopen: true}` that calls `reopenHunt()`, in `src/app/api/preferences/route.ts`.
- Behaviour (mockup "A · My criteria (full scroll)"):
  - Summary banner (primary): "**{matchCount}** match", "{hiddenCount} hidden by your rules", **See hidden**.
  - Cards, each with title 17/700, one-line effect 13/500, then the control:
    - **Budget:** histogram of seen yearly rents, 12 bins, in-range bars primary; 2-handle slider; Minimum/Maximum inputs accepting `800k`/`2m`.
    - **Bedrooms:** grid `minmax(0,1.8fr) repeat(4, minmax(0,1fr))`; Studio label must not wrap or clip.
    - **Areas:** Preferred (primary-tint chips) and Never show (coral-tint chips). "Add area" opens a searchable list of the parser's known area names plus free text.
    - **Power:** 3 radio cards with the exact copy from the mockup.
    - **Blocked agents:** with Unblock.
  - When `huntState==="done"`: a top card "Your hunt is finished" with **Reopen hunt**.
  - Saves debounced 400ms after each change, with a quiet "Saved" toast. No Save button.
  - `/criteria/hidden`: listings grouped by `HideReason`, with human labels:
    - Never-show area
    - Blocked agent
    - Over budget
    - Under budget
    - Bedrooms
    - Shortlet
    - Power not mentioned

- [ ] **Step 1:** Implement the pages and components.
- [ ] **Step 2:** Run `npx tsc --noEmit && pnpm lint`. Expected: clean.
- [ ] **Step 3:** Manual check:
  - set max 1m, and Inbox and banner counts change;
  - add Never show "Lekki", and Lekki Phase 1 listings appear under Hidden as "Never-show area";
  - Studio fits at 390px width.
- [ ] **Step 4:** Commit: `feat(ui): my criteria and hidden listings`.

### Task 15: Searches screen and old pages

**Files:**
- Create: `src/app/searches/page.tsx`, `src/app/searches/runs/[id]/page.tsx`, `src/components/searches/searches-view.tsx`
- Move: `src/components/run-view.tsx` → `src/components/searches/run-view.tsx` (restyle to tokens; keep CSV export)
- Delete: `src/app/history/`, `src/app/settings/`, `src/app/runs/`, `src/components/search-form.tsx`, `src/components/settings-form.tsx`, `src/components/site-header.tsx` (if not already)
- Modify: `next.config.ts`, adding redirects `/runs/:id` → `/searches/runs/:id`, `/history` → `/searches`, `/settings` → `/searches`.

**Interfaces:**
- Consumes: searches routes (Task 7), `GET /api/runs`, `GET/PUT /api/settings` (Apify token, unchanged API).
- Behaviour:
  - Saved search cards: terms as chips, "{count} videos per tag", Daily switch, **Run now**, delete.
  - "New search" form reuses `TagInput`.
  - Recent runs list: date, tags, status badge, result count, "Scheduled" label for cron runs.
  - Apify section: token field (masked) + demo-mode note (moved from Settings).
  - Scraping-terms notice at the bottom (the existing footer copy).

- [ ] **Step 1:** Implement the pages, move and restyle `run-view`, delete the old pages and add redirects.
- [ ] **Step 2:** Run `npx tsc --noEmit && pnpm lint && pnpm build && pnpm test`. Expected: all clean.
- [ ] **Step 3:** Manual check: create a saved search, Run now, watch progress on the run page; its listings land in the Inbox; old URLs redirect.
- [ ] **Step 4:** Commit: `feat(ui): searches, run history and settings`.

### Task 16: Docs and final verification

**Files:**
- Modify: `README.md`, `.env.example`

- [ ] **Step 1:** README:
  - what the app does now;
  - local setup (mock mode);
  - Vercel deploy:
    1. add Turso from the Marketplace;
    2. set `APIFY_TOKEN`, `APP_PASSWORD`, `CRON_SECRET`, `APIFY_WEBHOOK_SECRET`, `APP_URL`;
    3. the cron runs daily at 07:00 Lagos;
  - how the webhook works and the polling fallback.
- [ ] **Step 2:** Run `pnpm test && npx tsc --noEmit && pnpm lint && pnpm build`. Expected: all pass. Paste the summary lines into the PR or hand-off message.
- [ ] **Step 3:** Full mock-mode walkthrough at 390×844: Searches run → Inbox reel/grid → Listing → WhatsApp → Tracker through Got it → My criteria reopen. Compare every screen with the mockups for hierarchy, spacing and palette.
- [ ] **Step 4:** Commit: `docs: rental hunt setup and deploy`.
