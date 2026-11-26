"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, DownloadIcon } from "lucide-react";
import { notifyInboxChanged } from "@/components/app/tab-bar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api/client";
import { formatDateTime, formatHomeTitle, formatPrice } from "@/lib/format";
import type { ListingsResponse, Run } from "@/lib/types";
import { errorText, RunStatusPill, SectionLabel } from "./controls";

const POLL_MS = 2000;
const TOKEN_CODES = new Set(["TOKEN_MISSING", "TOKEN_INVALID"]);

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** One run: progress while it scrapes, then what it found. Each poll also advances the run server-side. */
export function RunView({ id }: { id: string }) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Poll run status until it finishes.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let wasActive = false;
    async function poll() {
      try {
        const { run } = await api<{ run: Run }>(`/api/runs/${id}`);
        if (cancelled) return;
        setRun(run);
        setPollWarning(false);
        const active = run.status === "queued" || run.status === "running";
        // The run just finished here: its listings are in the Inbox now, so refresh the tab badge.
        if (wasActive && !active) notifyInboxChanged();
        wasActive = active;
        if (active) timer = setTimeout(poll, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        const err = e as ApiError;
        if (err.status === 404) return setLoadError("This run doesn't exist. It may have been deleted.");
        // Transient failure: keep polling, but say so.
        setPollWarning(true);
        timer = setTimeout(poll, POLL_MS * 2);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  async function retry() {
    if (!run || retrying) return;
    setRetrying(true);
    try {
      const { run_id } = await api<{ run_id: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ tags: run.tags, count: run.count }),
      });
      router.push(`/searches/runs/${run_id}`);
    } catch (e) {
      setRun({ ...run, error: errorText(e) });
      setRetrying(false);
    }
  }

  if (loadError) {
    return (
      <>
        <RunHeader />
        <div role="alert" className="mx-6 flex flex-col items-start gap-4 rounded-[24px] border border-line bg-surface p-6">
          <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">{loadError}</p>
          <Button variant="outline" nativeButton={false} render={<Link href="/searches" />}>
            Back to Searches
          </Button>
        </div>
      </>
    );
  }

  if (!run) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Loading the run</span>
        <RunHeader />
        <div className="flex flex-col gap-3 px-6">
          <Skeleton className="h-[160px] w-full rounded-[24px]" />
        </div>
      </div>
    );
  }

  const active = run.status === "queued" || run.status === "running";
  const pct = run.target ? Math.min(100, Math.round((run.scraped / run.target) * 100)) : 0;

  return (
    <>
      <RunHeader run={run} />
      <div className="flex flex-col gap-8 px-6 pb-8">
        {active && (
          <section
            aria-label="Progress"
            className="flex flex-col gap-4 rounded-[24px] border border-line bg-surface px-5 py-6"
          >
            <Progress value={pct} aria-label="Scrape progress" className="[&_[data-slot=progress-track]]:h-2" />
            <div aria-live="polite" className="flex flex-col gap-1">
              <p className="m-0 text-[15px] font-semibold text-text tabular-nums">
                {run.status === "queued" ? "Starting…" : `Collected ${run.scraped} of up to ${run.target} videos`}
              </p>
              <p className="m-0 text-[13px] leading-[1.5] font-medium text-text-3">
                {pollWarning
                  ? "Connection hiccup, still checking…"
                  : "You can leave this page. Listings reach your Inbox when the run finishes."}
              </p>
            </div>
          </section>
        )}

        {run.status === "failed" && (
          <section
            role="alert"
            className="flex flex-col gap-4 rounded-[24px] border border-line bg-surface px-5 py-6"
          >
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-[17px] font-bold text-text">The run failed</h2>
              <p className="m-0 text-[15px] leading-[1.6] font-medium text-needs-ink">{run.error ?? "No reason was given."}</p>
            </div>
            <div className="flex flex-col gap-2">
              {run.error_code && TOKEN_CODES.has(run.error_code) ? (
                <>
                  <Button size="lg" className="w-full" nativeButton={false} render={<Link href="/searches#apify" />}>
                    Check Apify token
                  </Button>
                  <Button variant="outline" className="w-full" disabled={retrying} onClick={() => void retry()}>
                    {retrying ? "Retrying…" : "Retry"}
                  </Button>
                </>
              ) : (
                <Button size="lg" className="w-full" disabled={retrying} onClick={() => void retry()}>
                  {retrying ? "Retrying…" : "Retry"}
                </Button>
              )}
            </div>
          </section>
        )}

        {run.status === "done" && <Results run={run} />}
      </div>
    </>
  );
}

function RunHeader({ run }: { run?: Run }) {
  return (
    <header style={{ padding: "calc(8px + env(safe-area-inset-top)) 24px 24px" }} className="flex flex-col gap-2">
      <Link
        href="/searches"
        className="-ml-3 inline-flex min-h-12 items-center gap-1 self-start rounded-full px-3 text-[15px] font-semibold text-primary no-underline hover:bg-subtle"
      >
        <ChevronLeft aria-hidden className="size-5" strokeWidth={1.8} />
        Searches
      </Link>
      {run ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <h1 className="m-0 min-w-0 text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] break-words text-text">
              {run.tags.join(", ")}
            </h1>
            <span className="pt-1.5">
              <RunStatusPill status={run.status} />
            </span>
          </div>
          <p className="m-0 text-sm leading-[1.4] font-medium text-text-2 tabular-nums">
            {formatDateTime(run.created_at)} · {run.count} videos per tag
            {run.source === "scheduled" ? " · Scheduled" : ""}
          </p>
        </>
      ) : (
        <h1 className="m-0 text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] text-text">Run</h1>
      )}
    </header>
  );
}

function Results({ run }: { run: Run }) {
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<ListingsResponse>(`/api/runs/${run.id}/listings`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [run.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching once the run is done
    if (run.result_count > 0) void load();
  }, [load, run.result_count]);

  return (
    <>
      <section
        aria-labelledby="found-h"
        className="flex flex-col gap-5 rounded-[24px] border border-line bg-surface px-5 py-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="found-h" className="m-0 text-[17px] font-bold text-text">
            {run.result_count === 0 ? "No videos found" : `${plural(run.result_count, "listing")} found`}
          </h2>
          <p className="m-0 text-[13px] leading-[1.5] font-medium text-text-3">
            {run.result_count === 0
              ? "Try a broader hashtag such as #lagosapartments or #houseforrentinlagos."
              : "The ones that match your criteria are in your Inbox."}
          </p>
          {run.error && (
            <p role="status" className="m-0 pt-1 text-[13px] leading-[1.5] font-semibold text-needs-ink">
              Some tags failed: {run.error}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="lg" className="w-full" nativeButton={false} render={<Link href="/" />}>
            Open Inbox
          </Button>
          {run.result_count > 0 && (
            <Button
              variant="outline"
              className="w-full"
              nativeButton={false}
              render={<a href={`/api/runs/${run.id}/export.csv`} download />}
            >
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
          )}
        </div>
      </section>

      {run.result_count > 0 && (
        <section aria-labelledby="listings-l">
          <SectionLabel id="listings-l">Found in this run</SectionLabel>
          {error ? (
            <div role="alert" className="flex flex-col items-start gap-4 rounded-[24px] border border-line bg-surface p-6">
              <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">
                Couldn&apos;t load the listings. {error}
              </p>
              <Button variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : !data ? (
            <Skeleton className="h-[280px] w-full rounded-[24px]" />
          ) : (
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[24px] border border-line bg-surface p-0">
              {data.listings.map((l, i) => (
                <li key={l.id} className={i ? "border-t border-[#E4EBE9]" : undefined}>
                  <Link
                    href={`/listing/${l.id}`}
                    className="flex min-h-16 items-center gap-3 px-5 py-3 no-underline hover:bg-subtle focus-visible:-outline-offset-2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[17px] font-extrabold text-text tabular-nums">
                        {formatPrice(l) || "No price"}
                      </span>
                      <span className="truncate text-sm font-semibold text-text-2">{formatHomeTitle(l)}</span>
                      <span className="truncate text-[13px] font-medium text-text-3">
                        @{l.author}
                        {l.seen_before ? " · Seen before" : ""}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-text-3" strokeWidth={1.8} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
