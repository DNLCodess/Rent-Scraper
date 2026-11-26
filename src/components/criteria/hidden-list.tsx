"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Cover } from "@/components/app/cover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { formatHomeTitle, formatPrice } from "@/lib/format";
import type { HideReason } from "@/lib/rules";
import type { InboxItem } from "@/lib/types";

/** Groups in the order the rules are checked, with the labels the owner sees. */
const REASONS: { reason: HideReason; label: string }[] = [
  { reason: "excluded_area", label: "Never-show area" },
  { reason: "blocked_author", label: "Blocked agent" },
  { reason: "over_budget", label: "Over budget" },
  { reason: "under_budget", label: "Under budget" },
  { reason: "bedrooms", label: "Bedrooms" },
  { reason: "shortlet", label: "Shortlet" },
  { reason: "power_required", label: "Power not mentioned" },
];

type Hidden = Array<{ item: InboxItem; reason: HideReason }>;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/** See hidden: new listings a rule keeps out of the Inbox, grouped by that rule. */
export function HiddenList() {
  const [data, setData] = useState<Hidden | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Hidden>("/api/inbox/hidden").then(
      (d) => {
        setData(d);
        setError(null);
      },
      (err) => setError(errorText(err)),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <>
      <div className="px-4" style={{ paddingTop: "calc(8px + env(safe-area-inset-top))" }}>
        <Link
          href="/criteria"
          className="inline-flex h-12 items-center gap-1 rounded-full pr-4 pl-2 text-[15px] font-semibold text-primary no-underline hover:bg-subtle"
        >
          <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={1.8} />
          My criteria
        </Link>
      </div>
      <HiddenHeader count={data?.length} />
    </>
  );

  if (error && !data) {
    return (
      <>
        {header}
        <div role="alert" className="mx-6 flex flex-col items-start gap-4 rounded-[24px] border border-line bg-surface p-6">
          <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">
            Couldn&apos;t load hidden listings. {error}
          </p>
          <Button variant="outline" onClick={load}>
            Retry
          </Button>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Loading hidden listings</span>
        {header}
        <div className="flex flex-col gap-3 px-6">
          <Skeleton className="h-3 w-28" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const groups = REASONS.map((r) => ({ ...r, items: data.filter((h) => h.reason === r.reason).map((h) => h.item) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      {header}
      {groups.length === 0 ? (
        <p className="mx-6 my-0 rounded-[24px] border border-line bg-surface p-6 text-[15px] leading-[1.6] font-medium text-text-2">
          Nothing is hidden right now.
        </p>
      ) : (
        <div className="flex flex-col gap-8 px-6 pb-8">
          {groups.map((g) => (
            <section key={g.reason} aria-labelledby={`hidden-${g.reason}`} className="flex flex-col gap-1">
              <h2
                id={`hidden-${g.reason}`}
                className="m-0 mb-2 text-xs font-bold tracking-[0.06em] text-text-3 uppercase"
              >
                {g.label} <span className="font-medium tabular-nums">· {g.items.length}</span>
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {g.items.map((l) => (
                  <li key={l.id}>
                    <HiddenRow listing={l} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function HiddenHeader({ count }: { count: number | undefined }) {
  return (
    <header className="flex flex-col gap-2 px-6 pt-4 pb-6">
      <h1 className="m-0 text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] text-text">Hidden listings</h1>
      <p className="m-0 text-sm leading-[1.4] font-medium text-text-2">
        {count === undefined
          ? "Listings your rules keep out of the Inbox."
          : `${count} kept out of your Inbox by your rules. Change a rule in My criteria to bring them back.`}
      </p>
    </header>
  );
}

function HiddenRow({ listing: l }: { listing: InboxItem }) {
  const price = formatPrice(l);
  return (
    <Link
      href={`/listing/${encodeURIComponent(l.id)}`}
      className="flex min-w-0 items-center gap-4 rounded-2xl py-3 text-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Cover listingId={l.id} className="h-16 w-12 shrink-0 rounded-xl" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-base leading-[1.3] font-bold text-text">{formatHomeTitle(l)}</span>
        <span className="truncate text-sm font-medium text-text-2 tabular-nums">
          {price ? `${price} · ` : ""}@{l.author.replace(/^@+/, "")}
        </span>
      </span>
    </Link>
  );
}
