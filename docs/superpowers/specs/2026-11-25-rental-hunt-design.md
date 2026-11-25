# Rental Hunt — design

Date: 2026-11-25 · Status: draft for approval
Mockups (source of truth for look): https://claude.ai/artifact/USZd2wUsbhWty9GZyJohnP — top row "A · Reel — Lagoon & Brass".

## 1. Intent

The existing app scrapes TikTok rental posts (via Apify) into per-run tables. The owner is now hunting for a place to live **for their own move, right now**, in Lagos/Ibadan. Their real workflow is: spot a listing → message the agent on WhatsApp → inspect → negotiate → take it or drop it.

This project turns the scraper into a **personal rental-hunting tool**: one Inbox of new listings filtered and ranked by their criteria, fast triage (alone or in batches), and a tracker that carries each promising listing through that workflow. It ends when they find a place.

The three things that make them stop on a TikTok listing: **price within budget, area, stable electricity ("light")**. The app must surface exactly those.

## 2. Goals, non-goals, anti-goals

**Goals**
- Seen/dismissed listings never come back; dismiss or shortlist one at a time or in groups.
- Excluded areas and blocked agents never reach the Inbox.
- A tracker that mirrors the real workflow, with nudges when an agent goes quiet and the next inspection always visible.
- New listings arrive daily without opening the app.
- Premium, mobile-first UI that follows the agreed design system (section 9) on every screen.

**Non-goals**
- Multiple users or clients, sharing, accounts beyond a single password.
- Push notifications (in-app nudges only).
- Video/audio transcription, image analysis, other platforms.
- Auto-messaging agents (the app opens WhatsApp; the owner sends).
- Dark mode in this project (light palette ships; a dark variant may follow).

**Anti-goals (failure even if it "works")**
- A good listing silently hidden because the parser missed a field. Missing data must lower rank or tag "Check manually", never hide — except for the explicit hard rules below.
- Numbers the agent didn't state shown as fact (e.g. computing total package from percentages).
- Generic template UI, cramped spacing, flat hierarchy.
- Anything that lets a stranger spend the owner's Apify credit.

## 3. Constraints

- Hosting: **Vercel Hobby** only. No servers, no background workers. Hobby cron runs **at most once per day**.
- Database: **Turso** (libSQL) added from the Vercel Marketplace; local dev keeps a SQLite file. Already supported by `src/lib/db.ts`.
- Scraping: **Apify `clockworks~tiktok-scraper`** (pay per result), behind the existing `Scraper` interface (`src/lib/scraper/`). Mock provider stays for development.
- Stack stays: Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui (Base UI) restyled, TanStack where useful.
- Single user; whole app behind `APP_PASSWORD` (existing `src/proxy.ts`).
- Personal, one-hunt lifespan: optimise for simplicity over generality.

## 4. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | **Listing-centric app**: Inbox (all new listings across runs) is home; runs become background "Searches"; tracker over listing statuses; daily cron + Apify webhook | Biggest change to navigation and data model | **Chosen.** Only option where "dismissed never returns" and "new this morning" are natural |
| B | Keep run pages; add dismiss/shortlist and a tracker page on top | ~half the work, but dismissals feel per-run, no single "what's new" | Rejected |
| C | Scrape here, track in Google Sheets/Notion | Least to build; splits workflow across apps, loses WhatsApp/nudge integration | Rejected |

Earlier decision (already built): Apify instead of the unofficial TikTokApi library, for reliability and real keyword search.

Visual direction: two directions were mocked (A "Reel", B "Ledger"); **A chosen**, then refined with grid view, overlaid facts, new type, spacing system, and a light **Lagoon & Brass** palette chosen from three researched options.

## 5. Data model (changes to `src/lib/db.ts`)

Listings stay unique by TikTok video ID (already true). Add:

- `listings.status`: `new | dismissed | shortlisted | messaged | inspection_booked | inspected | negotiating | got_it | dropped` (default `new`).
- `listings.status_changed_at`, `listings.first_seen_at`.
- `listings.drop_reason`: `too_expensive | bad_area | agent_ghosted | fake_listing | taken | other` (nullable).
- `listings.power_level`: `strong | mentioned | unknown` (parsed), `listings.power_raw` (matched phrase).
- `listings.total_package_ngn` (only when the caption states it).
- `listings.inspection_at` (datetime), `listings.offer_ngn`, `listings.counter_ngn`.
- `listings.power_confirmed` (free text the owner logs after inspection, e.g. "Band A, ~20 hrs, neighbour confirmed").
- `listings.replied_at` (agent replied; stops nudges), `listings.archived` (bool, set when the hunt ends).
- `notes` table: `id, listing_id, body, created_at` (timestamped notes on any listing).
- `preferences` (single row / key-value): `budget_min_ngn`, `budget_max_ngn`, `beds` (set of `0..3`, `4+`), `preferred_areas[]`, `excluded_areas[]`, `power_mode: ignore | rank | require` (default `rank`), `nudge_days` (default 3), `hunt_state: active | done`.
- `blocked_authors`: `handle, blocked_at`.
- `saved_searches`: `id, terms[], count, daily (bool), created_at` (replaces "default tags" in settings).
- `runs.source`: `manual | scheduled`.

Existing per-run data and `run_listings` stay; runs are now history behind "Searches".

## 6. Parsing additions (`src/lib/parser.ts`, test-first like today)

- **Power level**
  - `strong`: 24/7 light, 24hrs power, constant/steady light, Band A, estate power, dedicated transformer.
  - `mentioned`: prepaid meter, solar, inverter (good, but not a supply promise).
  - otherwise `unknown`.
- **Total package**: only an explicit phrase ("total package ₦1.95m", "package: 2.2m", "total: ₦2m"). Never computed from agency/legal/caution percentages.
- Rent remains the primary price and the only one used for budget. Existing parsing of price, period, area, bedrooms, phones is unchanged.
- Listings are re-parsed on re-ingest (already true), so parser fixes apply retroactively.

## 7. Behaviour

### Inbox (home)
Shows listings with `status = new`, after **hard rules** hide:
- area in `excluded_areas`, including its sub-areas;
- author in `blocked_authors`;
- yearly rent known and > `budget_max` (or < `budget_min`);
- bedrooms known and not in `beds`;
- price period is per night (a shortlet, not a long let);
- `power_mode = require` and `power_level = unknown`.

Unknown values never trigger a hard rule (anti-goal 1).

**Seen = acted on.** A listing leaves the Inbox only when it is dismissed or shortlisted, one at a time or in a batch. Reel swipes are those two actions, so nothing becomes "seen" just by scrolling past it. The tab badge counts `status = new` after hard rules. The header's "N new" counts those first seen in the last 24 hours. *(my call)*

**Price periods** *(my call)*. Nigerian rent is quoted yearly by convention:
- no period → treated as yearly;
- per month → ×12 for budget checks only. Cards still show the rent as posted, e.g. "₦150k / month";
- per night → shortlet, hidden by the rule above, and listed under See hidden as "Shortlet".

**Areas** *(my call)*. The area list gets parent links: Lekki Phase 1 and Lekki Phase 2 belong to Lekki; Ikeja GRA belongs to Ikeja. Never show and Preferred apply to an area and its children. Unrelated names that only contain the word, like Ibeju-Lekki, are not children. A listing matched only to a city (no neighbourhood) has an unknown area: tagged "Check manually", never hidden. Places outside Lagos and Ibadan are not hidden by default; add them to Never show if needed.

Remaining listings are **ranked** (soft rules): preferred area, power level (if `power_mode = rank`), within budget, freshness. Listings missing price, area or bedrooms sort after complete ones and carry a **"Check manually"** tag. Listings older than 21 days carry **"Probably taken"**.

Header shows "N new · best match first". Two views, toggled top-right:
- **Reel** (default): one listing per screen, cover with facts overlaid. Actions: **Dismiss** and **Shortlist**, plus swipe left/right. ⋯ menu: *Dismiss all from @agent*, *Dismiss all in {area}*, *Block @agent*.
- **Grid** (2 columns): tap to select. Quick-select chips are generated from the current listings: top agents, top areas, "No price", "Over 3 weeks". Bottom bar: **Dismiss N / Shortlist N**.

"Strong match" tag marks the top-ranked listings. My call: score above a threshold, at most ~3 per day's batch.

### Listing detail
- Video area on top: TikTok embed player when tapped, cover image otherwise.
- White sheet, in this order:
  1. Rent (largest).
  2. "Total package ₦X · from the caption", only when stated.
  3. Title (type + area).
  4. Facts row: brass power tag · beds · posted age.
  5. "From the caption", with the parsed phrases highlighted.
  6. Agent: handle, phone, copy button.
- Bottom bar: Shortlist (icon) + **Message on WhatsApp** (primary).
- WhatsApp opens `wa.me/<phone>?text=<prefilled>`. The prefilled message asks availability and power: *"Hi, is the 2-bed in Yaba (₦1.5m/yr) from your TikTok still available? What's the power situation — which band and how many hours a day?"*
- Opening WhatsApp moves the listing to **Messaged**, with an undo toast.
- No phone found → the button becomes "Open on TikTok" (DM the creator there).

### Tracker
- Stage filter tabs: All · Shortlisted · Messaged · Inspecting · Negotiating.
- "This week" section first:
  - inspections within 7 days (date block, home, Message / **Log inspection**);
  - nudges: listings in Messaged longer than `nudge_days` with no change. **Nudge** opens WhatsApp with a short follow-up.
- **Agent replied** *(my call)*: a one-tap action on Messaged listings. It sets `replied_at`, shows the teal "Agent replied" tag, and stops nudges. Moving to any other stage also stops them.
- Then grouped lists per stage. Negotiating rows show "Asking ₦X · your offer ₦Y".
- Transitions: forward through the stages, or **Drop** at any point with a one-tap reason.
- **Book inspection**: date + time picker on a Messaged listing.
- **Log inspection** (sheet): power confirmed (text), notes, then **Negotiate** or **Drop**.
- **Negotiating**: offer and counter amounts editable.
- **Got it** → wrap-up. It confirms, then:
  - sets `hunt_state = done`;
  - pauses daily searches;
  - archives the remaining tracker items with `archived = true`, keeping their stage.
  
  While the hunt is done, the Inbox still shows what it has, the badge is hidden, and no new runs start. Reopening the hunt from My criteria un-archives everything to its previous stage and resumes daily searches. *(my call)*

### My criteria
Mocked as a tall frame. Contents:
- Summary banner: "N match · M hidden by your rules", with **See hidden** (lists hidden listings with the rule that hid each).
- Cards: Budget per year (price histogram of seen listings + 2-handle slider + min/max inputs accepting `800k`/`2m`), Bedrooms (Studio/1/2/3/4+ multi-select), Areas (Preferred / Never show chips + Add area from the parser's known-area list), Power (Don't mind / Rank it higher / Must be mentioned), Blocked agents (with Unblock).
- Changes save instantly.

### Searches
Saved searches list (terms, videos per term, daily on/off), **Run now**, run history with status, plus the existing run detail as a secondary view. The Apify token setting lives here, moved from today's Settings page. There is no second password: the whole app is already behind `APP_PASSWORD`. The cron and webhook routes skip that check and use their own secrets instead.

### Daily automatic run
- Vercel Cron (once a day, morning Lagos time) calls `/api/cron/daily`, protected by `CRON_SECRET`. It starts Apify runs for every `daily` saved search when `hunt_state = active`.
- Apify webhook on run success/failure calls `/api/webhooks/apify` (secret in the URL) and ingests results without anyone opening the app.
- The existing poll-to-advance path stays as a fallback and for manual runs.

## 8. Covers and video

- **Cover image**: `/api/cover/[videoId]` asks TikTok's public oEmbed endpoint (`https://www.tiktok.com/oembed?url=<video url>`) for a fresh `thumbnail_url` and redirects to it. Response cached briefly. No storage; expiring TikTok URLs don't matter. Fallback: neutral placeholder with play icon.
- **Playback**: TikTok's official embed player (`https://www.tiktok.com/embed/v2/<id>`) in the detail screen. Fallback: "Open on TikTok".
- Both are third-party endpoints: verify they work at build time before relying on them.

## 9. Design system (applies to every screen)

**Palette — Lagoon & Brass (light)**

| Token | Hex | Use |
|---|---|---|
| ground (Mist) | `#F2F5F4` | screen background |
| surface | `#FFFFFF` | cards, sheets, tab bar |
| subtle | `#E7EEEC` | quiet fills, avatars |
| line / line-strong | `#DCE4E2` / `#CBD6D4` | borders, outline buttons |
| text / text-2 / text-3 | `#0E2226` / `#4C5E61` / `#5C6E71` | primary / secondary / labels (all ≥4.5:1 on ground) |
| primary (Deep lagoon) | `#0F4F55` (+ white text); tint `#DCEBEA` | the one action, selected states, active tab, badges, dates |
| brass (power only) | tag `#EBCF96` with `#3D2A06` text; highlight `#F5E6C4` | power tag; parsed-phrase highlight |
| good (Teal) | `#17756A`; tint `#D8EEE9` / text `#0F5A50` | replied, confirmed, booked |
| needs-you (Coral) | `#C2502F`; tint `#F8E1D9` / text `#8E3519` | no reply, over budget, probably taken |
| cover | dark (`#2A3B3E` placeholder) with white text + bottom scrim | video covers stay dark/immersive |

Brass, teal and coral are never used for small text on white except at the darker text shades listed.

**Type** — Plus Jakarta Sans (Google Fonts), tabular numerals for money.

| Role | Size / weight |
|---|---|
| price | 36 / 800 (reel, detail); 19–26 on tiles |
| page title | 28 / 800 |
| section/card title | 17–20 / 700 |
| body | 15 / 500, line-height 1.6–1.7 |
| meta | 13–14 / 500 |
| label | 12 / 700, uppercase, +0.06em |

**Hierarchy rule** (every card): price → the home (type · area) → facts (power, beds, age) → who/when. One dominant element per card.

**Spacing** — 4-pt scale, only 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Screen gutter 24.
- Between sections 32.
- Label to content 12.
- Card padding 20–24.
- Between cards 12.
- Within a group 8; between groups 16.
- Content starts 24px below the device safe area (`env(safe-area-inset-top)` added).

**Touch** — all tappable ≥48px tall (chips ≥36 with ≥44 hit area); primary buttons 56–64.

**Controls** — rows of controls size to their labels; equal widths only for short uniform labels (e.g. bedroom numbers; "Studio" gets a wider column).

**Icons** — Lucide stroke icons at 1.8px. **Lightbulb = power/light** (never a zap). Others: bookmark = shortlist, x = dismiss, message-circle = WhatsApp.

**Shape** — radius 28 (reel cover), 24 (cards), 20 (tiles), 14–16 (inputs, segmented controls), pills for buttons and chips. Subtle borders instead of heavy shadows; one soft shadow lifts the reel cover.

**Navigation** — bottom tab bar: Inbox (badge = new count) · Tracker · Searches · My criteria.

**Accessibility** — WCAG AA contrast, visible focus rings (2px primary), real buttons/links/labels, `aria-pressed` on toggles, keyboard operable.

## 10. Screens

Mocked:
- Inbox reel
- Inbox grid (selecting)
- Listing detail
- Tracker
- My criteria

Not mocked; the builder designs them using the same system and patterns:
- Log inspection sheet
- Book inspection picker
- Drop-reason sheet
- "All caught up" empty Inbox: a calm message, time of the next daily run, link to Searches
- Got it wrap-up
- See hidden
- Searches and run history
- Settings inside Searches

## 11. Left to the builder

- Exact ranking weights and the "Strong match" threshold (sensible defaults; tune with real data).
- Gesture implementation for swipe, and the undo-toast duration.
- Whether to add a web app manifest so it installs to the home screen. My call: yes, it's cheap.
- Migration of existing runs/listings into the new statuses: all existing listings become `new`.
- Whether to keep TanStack Table anywhere: run history/hidden lists may simply be lists.
- Copy for screens not mocked, following the copy tone of the mocks.
