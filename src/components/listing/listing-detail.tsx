"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BedDouble,
  Bookmark,
  ChevronLeft,
  Clock,
  Copy,
  Ellipsis,
  ExternalLink,
  MessageCircle,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Cover } from "@/components/app/cover";
import { PowerTag } from "@/components/app/power-tag";
import { notifyInboxChanged } from "@/components/app/tab-bar";
import { ListingMenu } from "@/components/inbox/listing-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api/client";
import {
  formatAge,
  formatBedCount,
  formatHomeTitle,
  formatNaira,
  formatPeriod,
  formatPhone,
  formatPosted,
  formatRelative,
  LISTING_STATUS_LABEL,
  powerLabel,
} from "@/lib/format";
import { embedUrl } from "@/lib/tiktok";
import { cn } from "@/lib/utils";
import { firstMessage, waLink } from "@/lib/whatsapp";
import type { InboxItem, InboxResponse, ListingAction, ListingDetail as Detail, Note } from "@/lib/types";
import { Caption } from "./caption";

const UNDO_MS = 6000;

/** The fixed tab bar's height (border + 12 top + 48 link + 32 bottom), excluding the safe area. */
const TAB_BAR_PX = 93;
/** The bottom action bar's height (border + 16 + 56 + 16). */
const ACTION_BAR_PX = 89;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

function listingPath(id: string): string {
  return `/api/listings/${encodeURIComponent(id)}`;
}

type Load = { state: "loading" } | { state: "missing" } | { state: "error"; message: string } | { state: "ok" };

/** Listing detail: video on top, then a sheet with rent, facts, caption evidence, agent and notes. */
export function ListingDetail({ id }: { id: string }) {
  const [listing, setListing] = useState<Detail | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [playing, setPlaying] = useState(false);
  const [menuItem, setMenuItem] = useState<InboxItem | null>(null);
  const [menuItems, setMenuItems] = useState<InboxItem[]>([]);
  /** True while a status change is in flight; stops double taps from sending two actions. */
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const fetchListing = useCallback(
    () =>
      api<{ listing: Detail }>(listingPath(id)).then(
        ({ listing: l }) => {
          setListing(l);
          setLoad({ state: "ok" });
        },
        (err) => {
          if (err instanceof ApiError && err.status === 404) setLoad({ state: "missing" });
          else setLoad({ state: "error", message: errorText(err) });
        },
      ),
    [id],
  );

  useEffect(() => {
    void fetchListing();
  }, [fetchListing]);

  async function send(action: ListingAction): Promise<Detail | null> {
    const { listing: l } = await api<{ listing: Detail }>(`${listingPath(id)}/actions`, {
      method: "POST",
      body: JSON.stringify(action),
    });
    setListing(l);
    notifyInboxChanged();
    return l;
  }

  /** Applies a status change with an Undo toast. Returns quietly if another change is in flight. */
  async function change(action: ListingAction, done: string) {
    if (busy.current || !listing) return;
    busy.current = true;
    setPending(true);
    const title = formatHomeTitle(listing);
    try {
      await send(action);
      toast(done, {
        description: title,
        duration: UNDO_MS,
        action: { label: "Undo", onClick: () => void undo() },
      });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function undo() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await send({ type: "undo" });
    } catch (err) {
      toast.error(`Couldn't undo. ${errorText(err)}`);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function openMenu(l: Detail) {
    setMenuItems([l]);
    setMenuItem(l);
    // The block confirmation counts what it hides from the Inbox, so load the Inbox for it.
    try {
      const inbox = await api<InboxResponse>("/api/inbox");
      setMenuItems(inbox.items);
    } catch {
      // Keep the single-listing fallback; the count is a hint only.
    }
  }

  if (load.state === "loading") return <ListingDetailSkeleton />;
  if (load.state === "missing") return <Missing />;
  if (load.state === "error" || !listing) {
    return (
      <div
        role="alert"
        className="mx-6 flex flex-col items-start gap-4 rounded-3xl border border-line bg-surface p-6"
        style={{ marginTop: "calc(24px + env(safe-area-inset-top))" }}
      >
        <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">
          Couldn&apos;t load this listing. {load.state === "error" ? load.message : ""}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => fetchListing()}>
            Retry
          </Button>
          <Link href="/" className={buttonVariants({ variant: "ghost" })}>
            Back to Inbox
          </Link>
        </div>
      </div>
    );
  }

  const l = listing;
  const title = formatHomeTitle(l);
  const handle = `@${l.author.replace(/^@+/, "")}`;
  const phone = formatPhone(l.phone);
  const wa = waLink(l.phone, firstMessage(l));
  const beds = formatBedCount(l.bedrooms);
  const age = l.posted_at ? formatAge(l.posted_at) : formatPosted(l);
  const canMessage = l.status === "new" || l.status === "shortlisted";
  const inTracker = l.status !== "new" && l.status !== "dismissed";

  function messageOnWhatsApp() {
    if (!wa) return;
    // Open first, synchronously inside the tap, so the browser never blocks it.
    window.open(wa, "_blank", "noopener");
    if (canMessage) void change({ type: "messaged" }, "Marked as Messaged");
  }

  async function copyPhone() {
    const first = l.phone
      ?.split(",")
      .map((p) => p.trim())
      .find(Boolean);
    if (!first) return;
    try {
      await navigator.clipboard.writeText(first);
      toast("Phone number copied", { description: phone ?? first });
    } catch {
      toast.error("Couldn't copy the number. Press and hold it to copy instead.");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* Video: the cover until play is tapped, then the TikTok embed. */}
      <div className="relative w-full shrink-0 bg-(--cover)" style={{ height: playing ? "min(640px, 72dvh)" : 360 }}>
        {playing ? (
          <iframe
            src={embedUrl(l.id)}
            title={`TikTok video by ${handle}`}
            allow="encrypted-media; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <>
            <Cover listingId={l.id} className="absolute inset-0" />
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                aria-label="Play video"
                onClick={() => setPlaying(true)}
                className="flex size-16 items-center justify-center rounded-full bg-[rgba(14,34,38,0.55)] text-white hover:bg-[rgba(14,34,38,0.7)]"
              >
                <Play aria-hidden className="ml-[3px] size-[26px] fill-white stroke-none" />
              </button>
            </div>
          </>
        )}
        <div
          className="pointer-events-none absolute inset-x-6 flex justify-between"
          style={{ top: "calc(24px + env(safe-area-inset-top))" }}
        >
          <Link
            href="/"
            aria-label="Back to Inbox"
            className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-surface text-text shadow-[0_2px_8px_rgba(14,34,38,0.12)]"
          >
            <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={1.8} />
          </Link>
          <button
            type="button"
            aria-label={`More actions: dismiss all from ${handle} or this area, or block ${handle}`}
            aria-haspopup="dialog"
            onClick={() => void openMenu(l)}
            className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-surface text-text shadow-[0_2px_8px_rgba(14,34,38,0.12)]"
          >
            <Ellipsis aria-hidden className="size-[22px]" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <section
        aria-label="Listing details"
        className={cn("relative flex flex-col gap-6 rounded-t-[28px] bg-surface px-6 pt-3", playing ? "mt-0" : "-mt-8")}
      >
        <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-line-strong" />

        {playing && (
          <p className="m-0 -mt-2 text-sm font-medium text-text-2">
            Video not playing?{" "}
            <a
              href={l.url}
              target="_blank"
              rel="noopener"
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              Open on TikTok
            </a>
          </p>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            {l.price_ngn !== null ? (
              <>
                <span className="text-[36px] leading-none font-extrabold tracking-[-0.03em] text-text tabular-nums">
                  {formatNaira(l.price_ngn)}
                </span>
                <span className="text-[15px] font-medium text-text-2">{formatPeriod(l.price_period)} rent</span>
              </>
            ) : (
              <span className="text-[28px] leading-none font-extrabold tracking-[-0.02em] text-text">
                No price given
              </span>
            )}
            {l.status !== "new" && (
              <span className="ml-auto inline-flex h-7 items-center self-center rounded-full bg-primary-tint px-3 text-[13px] font-bold text-primary">
                {LISTING_STATUS_LABEL[l.status]}
              </span>
            )}
          </div>
          {l.total_package_ngn !== null && (
            <p className="m-0 text-sm font-medium text-text-2 tabular-nums">
              Total package <span className="font-bold text-text">{formatNaira(l.total_package_ngn)}</span> · from the
              caption
            </p>
          )}
          <h1 className="m-0 mt-1 text-xl leading-[1.3] font-bold tracking-[-0.01em] text-text">{title}</h1>
        </div>

        <ul className="m-0 flex list-none flex-wrap items-center justify-between gap-3 border-y border-line px-0 py-4">
          {l.power_level !== "unknown" && (
            <li>
              <PowerTag level={l.power_level} label={powerLabel(l.power_level, l.power_raw)} />
            </li>
          )}
          {beds && (
            <li className="flex items-center gap-2 text-sm font-semibold text-text">
              <BedDouble aria-hidden className="size-[18px] text-text-2" strokeWidth={1.8} />
              {beds}
            </li>
          )}
          <li className="flex items-center gap-2 text-sm font-semibold text-text">
            <Clock aria-hidden className="size-[18px] text-text-2" strokeWidth={1.8} />
            {age}
          </li>
        </ul>

        <Caption text={l.caption} highlights={l.highlights} />

        <div className="flex items-center gap-3 pt-2">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-subtle text-[15px] font-extrabold text-primary"
          >
            {handle.charAt(1).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-[15px] font-bold text-text">{handle}</span>
            <span className="text-[13px] font-medium text-text-3 tabular-nums">
              {phone ?? "No phone number in the caption or bio"}
            </span>
          </div>
          {phone && (
            <button
              type="button"
              aria-label="Copy phone number"
              onClick={() => void copyPhone()}
              className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-text hover:bg-subtle"
            >
              <Copy aria-hidden className="size-[19px]" strokeWidth={1.8} />
            </button>
          )}
        </div>

        <Notes listingId={l.id} notes={l.notes} onAdded={(n) => setListing({ ...l, notes: [...l.notes, n] })} />

        {/* Keeps the last content clear of the fixed action bar. */}
        <div aria-hidden style={{ height: ACTION_BAR_PX }} />
      </section>

      <div
        className="fixed inset-x-0 z-30 mx-auto flex max-w-[480px] gap-3 border-t border-line bg-surface px-6 py-4"
        style={{ bottom: `calc(${TAB_BAR_PX}px + env(safe-area-inset-bottom))` }}
      >
        <button
          type="button"
          aria-label={inTracker ? `${LISTING_STATUS_LABEL[l.status]}, in your tracker` : "Shortlist"}
          aria-pressed={inTracker}
          disabled={l.status !== "new" || pending}
          onClick={() => void change({ type: "shortlist" }, "Added to your shortlist")}
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-text hover:bg-subtle disabled:cursor-default disabled:hover:bg-surface",
            inTracker && "border-primary text-primary",
            l.status === "dismissed" && "opacity-50",
          )}
        >
          <Bookmark aria-hidden className={cn("size-[22px]", inTracker && "fill-current")} strokeWidth={1.8} />
        </button>
        {wa ? (
          <button
            type="button"
            onClick={messageOnWhatsApp}
            className="flex h-14 flex-1 items-center justify-center gap-3 rounded-full bg-primary text-base font-bold text-white hover:bg-[#0B3B40]"
          >
            <MessageCircle aria-hidden className="size-5" strokeWidth={2.2} />
            Message on WhatsApp
          </button>
        ) : (
          <a
            href={l.url}
            target="_blank"
            rel="noopener"
            className="flex h-14 flex-1 items-center justify-center gap-3 rounded-full bg-primary text-base font-bold text-white no-underline hover:bg-[#0B3B40] hover:text-white"
          >
            <ExternalLink aria-hidden className="size-5" strokeWidth={2.2} />
            Open on TikTok
          </a>
        )}
      </div>

      <ListingMenu
        item={menuItem}
        items={menuItems}
        onClose={() => setMenuItem(null)}
        onChanged={() => {
          notifyInboxChanged();
          void fetchListing();
        }}
      />
    </div>
  );
}

function Notes({ listingId, notes, onAdded }: { listingId: string; notes: Note[]; onAdded: (n: Note) => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const newestFirst = [...notes].reverse();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const { note } = await api<{ note: Note }>(listingPath(listingId), {
        method: "POST",
        body: JSON.stringify({ note: body }),
      });
      onAdded(note);
      setDraft("");
    } catch (err) {
      toast.error(`Couldn't save the note. ${errorText(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="notes-title" className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 id="notes-title" className="m-0 text-xs font-bold tracking-[0.06em] text-text-3 uppercase">
        Your notes
      </h2>
      {newestFirst.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {newestFirst.map((n) => (
            <li key={n.id} className="flex flex-col gap-1 rounded-2xl bg-subtle px-4 py-3">
              <p className="m-0 text-[15px] leading-[1.5] break-words whitespace-pre-line text-text">{n.body}</p>
              <time dateTime={n.created_at} className="text-xs font-medium text-text-3">
                {formatRelative(n.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-col gap-3">
        <label htmlFor="note-input" className="text-sm font-semibold text-text-2">
          Add a note
        </label>
        <textarea
          id="note-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="e.g. Agent prefers calls after 5pm"
          className="min-h-24 w-full resize-y rounded-2xl border border-line-strong bg-surface px-4 py-3 text-[15px] leading-[1.5] text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <Button type="submit" variant="outline" className="self-start" disabled={!draft.trim() || saving}>
          {saving ? "Saving…" : "Add note"}
        </Button>
      </form>
    </section>
  );
}

/** Not found: the listing was deleted or the link is wrong. */
function Missing() {
  return (
    <section
      aria-labelledby="missing-title"
      className="mx-6 flex flex-col items-center gap-6 rounded-3xl border border-line bg-surface px-6 py-12 text-center"
      style={{ marginTop: "calc(24px + env(safe-area-inset-top))" }}
    >
      <div className="flex flex-col gap-2">
        <h1 id="missing-title" className="m-0 text-xl font-bold tracking-[-0.01em] text-text">
          This listing is no longer available
        </h1>
        <p className="m-0 text-[15px] leading-[1.6] font-medium text-text-2">
          It may have been removed, or the link is wrong.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        <ChevronLeft aria-hidden />
        Back to Inbox
      </Link>
    </section>
  );
}

/** Placeholder while the listing loads: the video block and the sheet's first lines. */
export function ListingDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading listing" className="flex min-h-dvh flex-col bg-surface">
      <div className="h-[360px] w-full bg-(--cover)" />
      <div className="relative -mt-8 flex flex-col gap-6 rounded-t-[28px] bg-surface px-6 pt-3">
        <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-line-strong" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-6 w-56" />
        </div>
        <Skeleton className="h-16 w-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
