"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/app/screen-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import type { Preferences } from "@/lib/preferences";
import { termLabel, toSearchTerm } from "@/lib/scraper/types";
import type { SavedSearch } from "@/lib/searches";
import { COUNT_OPTIONS, MAX_TAGS, type Run, type SettingsView } from "@/lib/types";
import { Card, errorText, FIELD_CLASS, LABEL_CLASS, RunStatusPill, SectionLabel, Segmented, SwitchRow } from "./controls";
import { TagInput } from "./tag-input";

const RECENT_RUNS = 10;
const DAILY_LABEL = "Search daily at 7:00";
const COUNTS = COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }));

export const TERMS_NOTICE =
  "Scraping may breach TikTok's Terms of Service. Only public data is collected, and you are responsible for how you use this tool and the data it returns.";

interface Loaded {
  searches: SavedSearch[];
  runs: Run[];
  settings: SettingsView;
  huntDone: boolean;
}

/** Same rule the server applies: single words become hashtags, phrases stay keywords. */
function normalizeTerm(text: string): string | null {
  const t = toSearchTerm(text);
  return t ? termLabel(t) : null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Searches: saved searches, a new-search form, recent runs and the Apify token. */
export function SearchesView() {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedSearch | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ searches }, { runs }, settings, prefs] = await Promise.all([
        api<{ searches: SavedSearch[] }>("/api/searches"),
        api<{ runs: Run[] }>("/api/runs"),
        api<SettingsView>("/api/settings"),
        api<Preferences>("/api/preferences"),
      ]);
      setData({ searches, runs: runs.slice(0, RECENT_RUNS), settings, huntDone: prefs.huntState === "done" });
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set when it resolves
    void load();
  }, [load]);

  const setSearches = (fn: (s: SavedSearch[]) => SavedSearch[]) =>
    setData((d) => d && { ...d, searches: fn(d.searches) });

  async function runNow(s: SavedSearch) {
    if (starting) return;
    setStarting(s.id);
    try {
      const { run } = await api<{ run: Run }>(`/api/searches/${s.id}/run`, { method: "POST" });
      router.push(`/searches/runs/${run.id}`);
    } catch (err) {
      toast.error(`Couldn't start the search. ${errorText(err)}`);
      setStarting(null);
    }
  }

  async function setDaily(s: SavedSearch, daily: boolean) {
    setSearches((list) => list.map((x) => (x.id === s.id ? { ...x, daily } : x)));
    try {
      const { search } = await api<{ search: SavedSearch }>(`/api/searches/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ daily }),
      });
      setSearches((list) => list.map((x) => (x.id === s.id ? search : x)));
      toast(daily ? "Daily search on" : "Daily search off", {
        description: daily ? "It runs every morning at 7:00." : "It only runs when you tap Run now.",
      });
    } catch (err) {
      setSearches((list) => list.map((x) => (x.id === s.id ? { ...x, daily: s.daily } : x)));
      toast.error(`Couldn't change the daily setting. ${errorText(err)}`);
    }
  }

  async function remove(s: SavedSearch) {
    try {
      await api(`/api/searches/${s.id}`, { method: "DELETE" });
      setSearches((list) => list.filter((x) => x.id !== s.id));
      setDeleting(null);
      toast("Search deleted", { description: "Past runs and their listings stay." });
    } catch (err) {
      toast.error(`Couldn't delete the search. ${errorText(err)}`);
    }
  }

  if (loadError && !data) {
    return (
      <>
        <SearchesHeader />
        <div role="alert" className="mx-6 flex flex-col items-start gap-4 rounded-[24px] border border-line bg-surface p-6">
          <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">
            Couldn&apos;t load your searches. {loadError}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </>
    );
  }

  if (!data) return <SearchesSkeleton />;

  const needsToken = data.settings.provider === "apify" && !data.settings.tokenSet;

  return (
    <>
      <SearchesHeader />
      <div className="flex flex-col gap-8 px-6 pb-8">
        {needsToken && (
          <p role="status" className="m-0 rounded-[20px] bg-needs-tint px-5 py-4 text-sm leading-[1.5] font-semibold text-needs-ink">
            No Apify token is set, so searches can&apos;t run yet.{" "}
            <a href="#apify" className="underline underline-offset-4">
              Add one below
            </a>
            .
          </p>
        )}

        <section aria-labelledby="saved-l">
          <SectionLabel id="saved-l">Saved searches</SectionLabel>
          {data.huntDone && (
            <p className="m-0 mb-3 text-[13px] leading-[1.5] font-medium text-text-2">
              Your hunt is finished, so daily searches are paused. Reopen it from My criteria to resume them.
            </p>
          )}
          {data.searches.length === 0 ? (
            <p className="m-0 rounded-[24px] border border-line bg-surface px-5 py-6 text-[15px] leading-[1.6] font-medium text-text-2">
              No saved searches yet. Save one below to run it again or every morning.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {data.searches.map((s) => (
                <li key={s.id}>
                  <SavedSearchCard
                    search={s}
                    starting={starting === s.id}
                    disabled={starting !== null}
                    onRun={() => void runNow(s)}
                    onDaily={(d) => void setDaily(s, d)}
                    onMore={() => setDeleting(s)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="new-l">
          <SectionLabel id="new-l">New search</SectionLabel>
          <NewSearchCard
            onSaved={(s) => setSearches((list) => [...list, s])}
            onRunStarted={(id) => router.push(`/searches/runs/${id}`)}
          />
        </section>

        <section aria-labelledby="runs-l">
          <SectionLabel id="runs-l">Recent runs</SectionLabel>
          <RecentRuns runs={data.runs} />
        </section>

        <section aria-labelledby="apify-l" id="apify" className="scroll-mt-6">
          <SectionLabel id="apify-l">Scraper</SectionLabel>
          <TokenCard settings={data.settings} onChange={(settings) => setData((d) => d && { ...d, settings })} />
        </section>

        <p className="m-0 text-[13px] leading-[1.6] font-medium text-text-3">{TERMS_NOTICE}</p>
      </div>

      <DeleteSheet search={deleting} onClose={() => setDeleting(null)} onConfirm={remove} />
    </>
  );
}

function SearchesHeader() {
  return <ScreenHeader title="Searches" subtitle="What to look for on TikTok, and when. Results land in your Inbox." />;
}

function TermChips({ terms }: { terms: string[] }) {
  return (
    <ul aria-label="Search terms" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {terms.map((t) => (
        <li key={t} className="inline-flex h-9 items-center rounded-full bg-primary-tint px-3 text-sm font-semibold text-primary">
          {t}
        </li>
      ))}
    </ul>
  );
}

function SavedSearchCard({
  search,
  starting,
  disabled,
  onRun,
  onDaily,
  onMore,
}: {
  search: SavedSearch;
  starting: boolean;
  disabled: boolean;
  onRun: () => void;
  onDaily: (daily: boolean) => void;
  onMore: () => void;
}) {
  const label = search.terms.join(", ");
  return (
    <article
      aria-label={label}
      className="flex flex-col gap-4 rounded-[24px] border border-line bg-surface px-5 pt-5 pb-6"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1.5">
          <TermChips terms={search.terms} />
          <p className="m-0 text-[13px] font-medium text-text-3">{search.count} videos per tag</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-3 shrink-0"
          aria-label={`More for ${label}`}
          aria-haspopup="dialog"
          onClick={onMore}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </div>
      <div className="border-t border-[#E4EBE9] pt-2">
        <SwitchRow
          id={`daily-${search.id}`}
          label={DAILY_LABEL}
          checked={search.daily}
          onChange={onDaily}
        />
      </div>
      <Button size="lg" className="w-full" disabled={disabled} onClick={onRun}>
        {starting ? "Starting…" : "Run now"}
      </Button>
    </article>
  );
}

function NewSearchCard({
  onSaved,
  onRunStarted,
}: {
  onSaved: (s: SavedSearch) => void;
  onRunStarted: (runId: string) => void;
}) {
  const [terms, setTerms] = useState<string[]>([]);
  const [count, setCount] = useState(30);
  const [daily, setDaily] = useState(false);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    if (!terms.length) return setError("Add at least one hashtag or keyword.");
    setBusy("save");
    setError(null);
    try {
      const { search } = await api<{ search: SavedSearch }>("/api/searches", {
        method: "POST",
        body: JSON.stringify({ terms, count, daily }),
      });
      onSaved(search);
      setTerms([]);
      setDaily(false);
      toast("Search saved", { description: daily ? "It runs every morning at 7:00." : "Tap Run now to start it." });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? err.message : `Couldn't save. ${errorText(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runOnce() {
    if (busy) return;
    if (!terms.length) return setError("Add at least one hashtag or keyword.");
    setBusy("run");
    setError(null);
    try {
      const { run_id } = await api<{ run_id: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ tags: terms, count }),
      });
      onRunStarted(run_id);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? err.message : `Couldn't start the search. ${errorText(err)}`);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        aria-label="New search"
        className="flex flex-col gap-6 rounded-[24px] border border-line bg-surface px-5 py-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="new-terms" className={LABEL_CLASS}>
            Hashtags or keywords
          </label>
          <TagInput
            id="new-terms"
            value={terms}
            onChange={(t) => {
              setTerms(t);
              if (t.length) setError(null);
            }}
            max={MAX_TAGS}
            normalize={normalizeTerm}
            placeholder="lagosapartments"
            describedBy="new-terms-help"
            invalid={!!error && !terms.length}
          />
          <p id="new-terms-help" className="m-0 text-[13px] leading-[1.5] font-medium text-text-3">
            Press Enter after each. One word is searched as a hashtag, a phrase as a keyword. Up to {MAX_TAGS}.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span id="new-count-l" className={LABEL_CLASS}>
            Videos per tag
          </span>
          <Segmented id="new-count" labelledBy="new-count-l" options={COUNTS} value={count} onChange={setCount} />
        </div>

        <SwitchRow
          id="new-daily"
          label={DAILY_LABEL}
          description="Runs every morning, so new posts reach your Inbox."
          checked={daily}
          onChange={setDaily}
        />

        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save search"}
          </Button>
          <Button type="button" variant="outline" className="w-full" disabled={busy !== null} onClick={() => void runOnce()}>
            {busy === "run" ? "Starting…" : "Run once"}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="m-0 px-1 text-[13px] leading-[1.5] font-semibold text-needs-ink">
          {error}
        </p>
      )}
    </div>
  );
}

function RecentRuns({ runs }: { runs: Run[] }) {
  if (runs.length === 0) {
    return (
      <p className="m-0 rounded-[24px] border border-line bg-surface px-5 py-6 text-[15px] leading-[1.6] font-medium text-text-2">
        No runs yet. Run a search and it shows up here.
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[24px] border border-line bg-surface p-0">
      {runs.map((run, i) => (
        <li key={run.id} className={i ? "border-t border-[#E4EBE9]" : undefined}>
          <Link
            href={`/searches/runs/${run.id}`}
            className="flex min-h-16 items-center gap-3 px-5 py-3 no-underline hover:bg-subtle focus-visible:-outline-offset-2"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-[15px] font-bold text-text">{run.tags.join(", ")}</span>
              <span className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-text-3 tabular-nums">
                <span>{formatDateTime(run.created_at)}</span>
                {run.status === "done" && <span>· {plural(run.result_count, "listing")}</span>}
                {run.source === "scheduled" && <span>· Scheduled</span>}
              </span>
            </span>
            <RunStatusPill status={run.status} />
            <ChevronRight aria-hidden className="size-5 shrink-0 text-text-3" strokeWidth={1.8} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TokenCard({ settings, onChange }: { settings: SettingsView; onChange: (s: SettingsView) => void }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(body: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);
    try {
      onChange(await api<SettingsView>("/api/settings", { method: "PUT", body: JSON.stringify(body) }));
      setToken("");
      toast(message);
    } catch (err) {
      setError(`Couldn't save the token. ${errorText(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const status = settings.tokenSet
    ? `A token is set (${settings.tokenPreview}, from ${settings.tokenSource === "env" ? "the APIFY_TOKEN environment variable" : "this screen"}).`
    : "No token is set.";

  return (
    <div className="flex flex-col gap-2">
      <Card
        id="token"
        title="Apify token"
        effect="Runs the TikTok scraper. Find it in Apify Console under Settings → API & Integrations. It stays on the server."
      >
        {settings.provider === "mock" && (
          <p className="m-0 rounded-2xl bg-subtle px-4 py-3 text-[13px] leading-[1.5] font-medium text-text-2">
            Demo mode is on (SCRAPER_PROVIDER=mock), so runs return sample data and the token is not used.
          </p>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) void save({ apifyToken: token }, "Token saved");
          }}
        >
          <label htmlFor="token-input" className={LABEL_CLASS}>
            Token
          </label>
          <div className="flex gap-2">
            <input
              id="token-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={settings.tokenSet ? `Current ${settings.tokenPreview}` : "apify_api_…"}
              aria-describedby="token-status"
              className={FIELD_CLASS}
            />
            <Button type="submit" disabled={saving || !token.trim()}>
              Save
            </Button>
          </div>
          <p id="token-status" className="m-0 text-[13px] leading-[1.5] font-medium text-text-3">
            {status}
          </p>
        </form>
        {settings.tokenSource === "settings" && (
          <Button
            variant="ghost"
            className="-ml-5 self-start"
            disabled={saving}
            onClick={() => void save({ clearToken: true }, "Saved token removed")}
          >
            Remove saved token
          </Button>
        )}
      </Card>
      {error && (
        <p role="alert" className="m-0 px-1 text-[13px] leading-[1.5] font-semibold text-needs-ink">
          {error}
        </p>
      )}
    </div>
  );
}

function DeleteSheet({
  search,
  onClose,
  onConfirm,
}: {
  search: SavedSearch | null;
  onClose: () => void;
  onConfirm: (s: SavedSearch) => Promise<void>;
}) {
  const [shown, setShown] = useState<SavedSearch | null>(search);
  const [busy, setBusy] = useState(false);
  // Keep the last search visible while the sheet animates closed.
  if (search && search !== shown) setShown(search);
  const current = search ?? shown;

  async function confirm() {
    if (!current || busy) return;
    setBusy(true);
    try {
      await onConfirm(current);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={search !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[90dvh] max-w-[480px] gap-0 overflow-y-auto rounded-t-3xl border-line bg-surface px-6 pt-2"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        <span aria-hidden className="mt-1 h-1 w-10 self-center rounded-sm bg-line-strong" />
        {current && (
          <>
            <SheetHeader className="gap-1 px-0 pt-4 pb-6">
              <SheetTitle className="text-[19px] leading-[1.3] font-bold tracking-[-0.01em] text-text">
                Delete this search?
              </SheetTitle>
              <SheetDescription className="text-sm leading-[1.5] font-medium text-text-2">
                {current.terms.join(", ")}. It stops running daily. Past runs and their listings stay.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2">
              <Button variant="destructive" size="lg" className="w-full" disabled={busy} onClick={() => void confirm()}>
                {busy ? "Deleting…" : "Delete search"}
              </Button>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SearchesSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading your searches</span>
      <SearchesHeader />
      <div className="flex flex-col gap-8 px-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32 rounded-sm" />
          <Skeleton className="h-[220px] w-full rounded-[24px]" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28 rounded-sm" />
          <Skeleton className="h-[360px] w-full rounded-[24px]" />
        </div>
      </div>
    </div>
  );
}
