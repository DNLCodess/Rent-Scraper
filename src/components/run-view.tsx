"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadIcon, SlidersHorizontalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingFilters } from "@/components/listing-filters";
import { ListingsTable } from "@/components/listings-table";
import { api, ApiError } from "@/lib/api/client";
import { activeFilterCount, EMPTY_FILTERS, toQuery, type FilterState } from "@/lib/filters";
import { formatDateTime, STATUS_LABEL, statusVariant } from "@/lib/format";
import type { ListingsResponse, Run } from "@/lib/types";

const POLL_MS = 2000;
const TOKEN_CODES = new Set(["TOKEN_MISSING", "TOKEN_INVALID"]);

export function RunView({ id }: { id: string }) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Poll run status until it finishes. Each poll also advances the run server-side.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const { run } = await api<{ run: Run }>(`/api/runs/${id}`);
        if (cancelled) return;
        setRun(run);
        setPollWarning(false);
        if (run.status === "queued" || run.status === "running") timer = setTimeout(poll, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        const err = e as ApiError;
        if (err.status === 404) return setLoadError("This run doesn't exist. It may have been deleted.");
        // Transient failure: keep polling, but tell the user.
        setPollWarning(true);
        timer = setTimeout(poll, POLL_MS * 2);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  async function retry() {
    if (!run) return;
    setRetrying(true);
    try {
      const { run_id } = await api<{ run_id: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ tags: run.tags, count: run.count }),
      });
      router.push(`/runs/${run_id}`);
    } catch (e) {
      setRun({ ...run, error: (e as ApiError).message });
      setRetrying(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="space-y-3">
        <p>{loadError}</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          New search
        </Button>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const active = run.status === "queued" || run.status === "running";
  const pct = run.target ? Math.round((run.scraped / run.target) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{run.tags.join(", ")}</h1>
          <Badge variant={statusVariant(run.status)}>{STATUS_LABEL[run.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(run.created_at)} · {run.count} videos per tag
        </p>
      </div>

      {active && (
        <div className="space-y-2" aria-live="polite">
          <Progress value={pct} aria-label="Scrape progress" />
          <p className="text-sm text-muted-foreground">
            {run.status === "queued" ? "Starting…" : `Collected ${run.scraped} of up to ${run.target} videos…`}
          </p>
          {pollWarning && <p className="text-sm text-muted-foreground">Connection hiccup, still checking…</p>}
        </div>
      )}

      {run.status === "failed" && (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 px-4 py-3">
          <p className="text-sm">{run.error ?? "The run failed."}</p>
          <div className="flex gap-2">
            {run.error_code && TOKEN_CODES.has(run.error_code) && (
              <Button nativeButton={false} render={<Link href="/settings" />}>
                Open Settings
              </Button>
            )}
            <Button variant="outline" onClick={retry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </div>
      )}

      {run.status === "done" && (
        <>
          {run.error && (
            <p role="status" className="text-sm text-muted-foreground">
              Some tags failed: {run.error}
            </p>
          )}
          <Results run={run} />
        </>
      )}

      {active && <ResultsSkeleton />}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function Results({ run }: { run: Run }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Debounce filter changes so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(toQuery(filters)), 300);
    return () => clearTimeout(t);
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<ListingsResponse>(`/api/runs/${run.id}/listings${query}`));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [run.id, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on filter change
    load();
  }, [load]);

  if (run.result_count === 0) {
    return (
      <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
        No videos found for these tags. Try a broader hashtag such as #lagosapartments or #houseforrentinlagos.
      </p>
    );
  }

  const areas = data?.areas ?? [];
  const nActive = activeFilterCount(filters);
  const shown = data?.listings.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {data ? `${shown} of ${data.total} listings` : "Loading listings…"}
        </p>
        <div className="flex items-center gap-2">
          {/* Mobile: filters live in a Sheet */}
          <Sheet>
            <SheetTrigger render={<Button variant="outline" className="sm:hidden" />}>
              <SlidersHorizontalIcon data-icon="inline-start" />
              Filters{nActive ? ` (${nActive})` : ""}
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <ListingFilters value={filters} onChange={setFilters} areas={areas} layout="stack" idPrefix="m" />
              </div>
            </SheetContent>
          </Sheet>
          <Button
            nativeButton={false}
            render={<a href={`/api/runs/${run.id}/export.csv${query}`} download />}
            aria-disabled={shown === 0}
            className={shown === 0 ? "pointer-events-none opacity-50" : ""}
          >
            <DownloadIcon data-icon="inline-start" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="hidden sm:block">
        <ListingFilters value={filters} onChange={setFilters} areas={areas} layout="row" idPrefix="d" />
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 px-4 py-3">
          <p className="text-sm">{error}</p>
          <Button variant="outline" onClick={load}>
            Retry
          </Button>
        </div>
      ) : !data && loading ? (
        <ResultsSkeleton />
      ) : shown === 0 ? (
        <div className="space-y-3 rounded-lg border px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No listings match these filters.</p>
          <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <ListingsTable data={data!.listings} />
        </div>
      )}
    </div>
  );
}
