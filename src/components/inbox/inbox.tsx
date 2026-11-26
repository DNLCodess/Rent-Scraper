"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, RectangleVertical } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/app/screen-header";
import { notifyInboxChanged } from "@/components/app/tab-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { formatHomeTitle } from "@/lib/format";
import { withoutListings } from "@/lib/inbox-view";
import { cn } from "@/lib/utils";
import type { InboxItem, InboxResponse } from "@/lib/types";
import { CaughtUp } from "./caught-up";
import { Grid, type BatchType } from "./grid";
import { ListingMenu } from "./listing-menu";
import { Reel, type ReelAction } from "./reel";

type View = "reel" | "grid";

const VIEW_KEY = "inbox:view";
const UNDO_MS = 6000;

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "reel";
  } catch {
    return "reel";
  }
}

function saveView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode or blocked storage: the toggle still works for this visit.
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

function fetchInbox() {
  return Promise.all([
    api<InboxResponse>("/api/inbox"),
    api<{ huntState?: string }>("/api/preferences").catch(() => null),
  ]);
}

/** Reel height: the screen minus the space the fixed tab bar takes (main's bottom padding). */
const REEL_HEIGHT = "calc(100dvh - 96px - env(safe-area-inset-bottom))";

/** The Inbox: new listings, best match first, as a reel or a selectable grid. */
export function Inbox() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [huntDone, setHuntDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("reel");
  const [menuItem, setMenuItem] = useState<InboxItem | null>(null);
  const loadSeq = useRef(0);
  /** Listings with a dismiss/shortlist sent (or succeeded); a second call for the same id is ignored until undo or failure. */
  const acted = useRef(new Set<string>());

  /** Loads the Inbox and hunt state; a newer load wins over an older one still in flight. */
  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    return fetchInbox().then(
      ([inbox, prefs]) => {
        if (seq !== loadSeq.current) return;
        // A load that started before a dismiss/shortlist landed must not bring that card back.
        setData(withoutListings(inbox, acted.current));
        if (prefs) setHuntDone(prefs.huntState === "done");
        setError(null);
      },
      (err) => {
        if (seq === loadSeq.current) setError(errorText(err));
      },
    );
  }, []);

  useEffect(() => {
    // Storage is read after mount, so the server render and the first client render agree.
    load().then(() => setView(readView()));
  }, [load]);

  function changeView(next: View) {
    setView(next);
    saveView(next);
  }

  /** Drops listings from the screen right away; counts follow without a refetch. */
  function removeLocal(ids: string[]) {
    setData((d) => d && withoutListings(d, ids));
  }

  async function undo(item: InboxItem) {
    try {
      await api(`/api/listings/${encodeURIComponent(item.id)}/actions`, {
        method: "POST",
        body: JSON.stringify({ type: "undo" }),
      });
      acted.current.delete(item.id);
      await load();
      notifyInboxChanged();
    } catch (err) {
      toast.error(`Couldn't undo. ${errorText(err)}`);
    }
  }

  async function act(item: InboxItem, action: ReelAction) {
    if (acted.current.has(item.id)) return;
    acted.current.add(item.id);
    removeLocal([item.id]);
    try {
      await api(`/api/listings/${encodeURIComponent(item.id)}/actions`, {
        method: "POST",
        body: JSON.stringify({ type: action }),
      });
      notifyInboxChanged();
      toast(action === "dismiss" ? "Dismissed" : "Added to your shortlist", {
        description: formatHomeTitle(item),
        duration: UNDO_MS,
        action: { label: "Undo", onClick: () => void undo(item) },
      });
    } catch (err) {
      acted.current.delete(item.id);
      toast.error(errorText(err));
      load(); // put the listing back as the server sees it
    }
  }

  /** Resolves true on success; on failure the grid keeps its selection so the owner can retry. */
  async function batch(ids: string[], type: BatchType): Promise<boolean> {
    loadSeq.current++;
    try {
      const { changed } = await api<{ changed: number }>("/api/listings/batch", {
        method: "POST",
        body: JSON.stringify({ ids, type }),
      });
      const skipped = ids.length - changed;
      toast(`${type === "dismiss" ? "Dismissed" : "Shortlisted"} ${changed}`, {
        description: skipped > 0 ? `${skipped} had already moved out of the Inbox.` : undefined,
      });
      removeLocal(ids);
      notifyInboxChanged();
      await load();
      return true;
    } catch (err) {
      toast.error(errorText(err));
      return false;
    }
  }

  const toggle = (
    <div role="group" aria-label="View" className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
      <ViewButton label="One at a time" active={view === "reel"} onClick={() => changeView("reel")}>
        <RectangleVertical aria-hidden className="size-[18px]" strokeWidth={1.8} />
      </ViewButton>
      <ViewButton label="Grid" active={view === "grid"} onClick={() => changeView("grid")}>
        <LayoutGrid aria-hidden className="size-[18px]" strokeWidth={1.8} />
      </ViewButton>
    </div>
  );

  if (error && !data) {
    return (
      <>
        <ScreenHeader title="Inbox" />
        <div
          role="alert"
          className="mx-6 flex flex-col items-start gap-4 rounded-3xl border border-line bg-surface p-6"
        >
          <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">Couldn&apos;t load your Inbox. {error}</p>
          <Button variant="outline" onClick={() => load()}>
            Retry
          </Button>
        </div>
      </>
    );
  }

  if (!data) return <InboxSkeleton />;

  const items = data.items;
  if (items.length === 0) {
    return (
      <>
        <ScreenHeader title="Inbox" />
        <CaughtUp huntDone={huntDone} />
      </>
    );
  }

  const screenHeader = (
    <ScreenHeader
      title="Inbox"
      subtitle={
        <>
          <span className="font-bold text-text tabular-nums">{data.newToday} new</span> · best match first
        </>
      }
      right={toggle}
    />
  );
  const header = huntDone ? (
    <>
      {screenHeader}
      <HuntFinishedBanner />
    </>
  ) : (
    screenHeader
  );

  return (
    <>
      {view === "reel" ? (
        <div className="flex flex-col" style={{ height: REEL_HEIGHT, minHeight: 640 }}>
          {header}
          <Reel item={items[0]} hasNext={items.length > 1} onAction={act} onMenu={setMenuItem} />
        </div>
      ) : (
        <Grid items={items} header={header} onBatch={batch} />
      )}
      <ListingMenu
        item={menuItem}
        items={items}
        onClose={() => setMenuItem(null)}
        onChanged={() => {
          notifyInboxChanged();
          load();
        }}
      />
    </>
  );
}

/** Hunt is done (spec: the Inbox still shows what it has): a calm note with the way back. */
function HuntFinishedBanner() {
  return (
    <p
      role="status"
      className="mx-6 mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] leading-[1.5] font-medium text-text-2"
    >
      <span className="font-bold text-text">Hunt finished.</span> Daily searches are paused.{" "}
      <Link href="/criteria" className="font-bold text-primary underline-offset-2 hover:underline">
        Reopen it from My criteria
      </Link>{" "}
      to resume them.
    </p>
  );
}

function ViewButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-10 w-11 items-center justify-center rounded-xl",
        active ? "bg-primary text-white" : "text-text-2 hover:bg-subtle hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col" style={{ height: REEL_HEIGHT, minHeight: 640 }} aria-busy="true">
      <span className="sr-only">Loading your Inbox</span>
      <ScreenHeader
        title="Inbox"
        subtitle={<span className="inline-block h-4 w-40 animate-pulse rounded-md bg-muted align-middle" />}
      />
      <Skeleton className="mx-6 min-h-[360px] flex-1 rounded-[28px]" />
      <div className="flex gap-4 px-6 pt-8 pb-6">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-16 flex-1 rounded-full" />
      </div>
    </div>
  );
}
