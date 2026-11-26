"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  Ellipsis,
  ExternalLink,
  HandCoins,
  House,
  Inbox as InboxIcon,
  MessageCircle,
  ClipboardCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Cover } from "@/components/app/cover";
import { ScreenHeader } from "@/components/app/screen-header";
import { notifyInboxChanged } from "@/components/app/tab-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { formatAge, formatHomeTitle, formatNaira, formatPrice, LISTING_STATUS_LABEL, whatsappUrl } from "@/lib/format";
import { formatLagos } from "@/lib/time";
import { cn } from "@/lib/utils";
import { firstMessage, nudgeMessage, waLink } from "@/lib/whatsapp";
import type { ListingAction, ListingDetail, TrackerStage, TrackerView as Tracker } from "@/lib/types";
import { BookInspectionSheet } from "./book-inspection-sheet";
import { DropSheet } from "./drop-sheet";
import { GotItSheet } from "./got-it-sheet";
import { LogInspectionSheet } from "./log-inspection-sheet";
import { OfferSheet } from "./offer-sheet";
import { errorText, TrackerSheet } from "./tracker-sheet";

const UNDO_MS = 6000;
const DAY_MS = 86_400_000;

type Tab = "all" | "shortlisted" | "messaged" | "inspecting" | "negotiating";

const TABS: { id: Tab; label: string; stages: TrackerStage[] }[] = [
  { id: "all", label: "All", stages: [] },
  { id: "shortlisted", label: "Shortlisted", stages: ["shortlisted"] },
  { id: "messaged", label: "Messaged", stages: ["messaged"] },
  { id: "inspecting", label: "Inspecting", stages: ["inspection_booked", "inspected"] },
  { id: "negotiating", label: "Negotiating", stages: ["negotiating"] },
];

/** Stage sections under All, furthest along first. */
const SECTIONS: { tab: Exclude<Tab, "all">; label: string; stages: TrackerStage[] }[] = [
  { tab: "negotiating", label: "Negotiating", stages: ["negotiating"] },
  { tab: "inspecting", label: "Inspecting", stages: ["inspection_booked", "inspected"] },
  { tab: "messaged", label: "Messaged", stages: ["messaged"] },
  { tab: "shortlisted", label: "Shortlisted", stages: ["shortlisted"] },
];

type SheetKind = "actions" | "book" | "log" | "drop" | "offer" | "gotit";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function handleOf(l: ListingDetail): string {
  return `@${l.author.replace(/^@+/, "")}`;
}

function firstPhone(phones: string | null): string | null {
  return (
    phones
      ?.split(",")
      .map((p) => p.trim())
      .find((p) => p.replace(/\D/g, "")) ?? null
  );
}

/** "Sat 29 Nov · 10:00" in Lagos time. */
function inspectionWhen(iso: string): string {
  const d = new Date(iso);
  return `${formatLagos(d, "dayShort")} ${formatLagos(d, "date")} · ${formatLagos(d, "time")}`;
}

function listingsFor(data: Tracker, stages: TrackerStage[]): ListingDetail[] {
  return stages.flatMap((s) => data.stages[s]);
}

/** The Tracker: this week's inspections and nudges, then every active listing by stage. */
export function TrackerView() {
  const router = useRouter();
  const [data, setData] = useState<Tracker | null>(null);
  /** When the data was loaded; "No reply in n days" counts from here so renders stay pure. */
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [sheet, setSheet] = useState<{ kind: SheetKind; listing: ListingDetail } | null>(null);
  const loadSeq = useRef(0);
  /** True while an action is in flight; stops double taps from sending two actions. */
  const busy = useRef(false);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    return api<Tracker>("/api/tracker").then(
      (t) => {
        if (seq !== loadSeq.current) return;
        setData(t);
        setLoadedAt(Date.now());
        setError(null);
      },
      (err) => {
        if (seq === loadSeq.current) setError(errorText(err));
      },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (kind: SheetKind, listing: ListingDetail) => setSheet({ kind, listing });
  const close = () => setSheet(null);

  async function post(id: string, action: ListingAction): Promise<ListingDetail> {
    const { listing } = await api<{ listing: ListingDetail }>(`/api/listings/${encodeURIComponent(id)}/actions`, {
      method: "POST",
      body: JSON.stringify(action),
    });
    return listing;
  }

  async function undo(l: ListingDetail) {
    if (busy.current) return;
    busy.current = true;
    try {
      await post(l.id, { type: "undo" });
      notifyInboxChanged();
      await load();
    } catch (err) {
      toast.error(`Couldn't undo. ${errorText(err)}`);
    } finally {
      busy.current = false;
    }
  }

  /** Sends an action, toasts the outcome (with Undo for single status changes) and reloads. */
  async function run(l: ListingDetail, action: ListingAction): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    const title = formatHomeTitle(l);
    try {
      const updated = await post(l.id, action);
      notifyInboxChanged();
      setSheet(null);
      const withUndo = { description: title, duration: UNDO_MS, action: { label: "Undo", onClick: () => void undo(l) } };
      switch (action.type) {
        case "messaged":
          toast("Marked as Messaged", withUndo);
          break;
        case "replied":
          toast("Marked as Agent replied", { description: title });
          break;
        case "book_inspection": {
          const when = updated.inspection_at ? inspectionWhen(updated.inspection_at) : title;
          // Undo is only safe for the first booking; a reschedule keeps the stage and has nothing to undo.
          if (l.status === "messaged") toast("Inspection booked", { ...withUndo, description: `${title} · ${when}` });
          else toast("Inspection moved", { description: `${title} · ${when}` });
          break;
        }
        case "log_inspection":
          toast(action.next === "negotiating" ? "Moved to Negotiating" : "Dropped", { description: title });
          break;
        case "negotiate":
          toast("Moved to Negotiating", withUndo);
          break;
        case "offer":
          toast("Offer saved", { description: title });
          break;
        case "drop":
          toast("Dropped", withUndo);
          break;
        case "got_it":
          toast("Marked as your new place", { description: title });
          router.push("/");
          return true;
      }
      await load();
      return true;
    } catch (err) {
      toast.error(errorText(err));
      void load(); // show the listing as the server sees it
      return false;
    } finally {
      busy.current = false;
    }
  }

  /** Opens WhatsApp first, synchronously inside the tap, so the browser never blocks it. */
  function messageFromShortlist(l: ListingDetail) {
    const wa = waLink(l.phone, firstMessage(l));
    if (wa) window.open(wa, "_blank", "noopener");
    void run(l, { type: "messaged" });
  }

  if (error && !data) {
    return (
      <>
        <ScreenHeader title="Tracker" />
        <div role="alert" className="mx-6 flex flex-col items-start gap-4 rounded-3xl border border-line bg-surface p-6">
          <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">Couldn&apos;t load your tracker. {error}</p>
          <Button variant="outline" onClick={() => load()}>
            Retry
          </Button>
        </div>
      </>
    );
  }

  if (!data) return <TrackerSkeleton />;

  const inspections = data.thisWeek.inspections;
  const nudges = data.thisWeek.nudges;
  const count = (t: (typeof TABS)[number]) => (t.id === "all" ? data.activeCount : listingsFor(data, t.stages).length);
  const sections = SECTIONS.filter((s) => tab === "all" || s.tab === tab)
    .map((s) => ({ ...s, items: listingsFor(data, s.stages) }))
    .filter((s) => s.items.length > 0);
  const showWeek = tab === "all" && inspections.length + nudges.length > 0;

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next].id);
    document.getElementById(`tracker-tab-${TABS[next].id}`)?.focus();
  }

  return (
    <>
      <ScreenHeader
        title="Tracker"
        subtitle={
          <>
            <span className="font-bold text-text tabular-nums">{data.activeCount} active</span> ·{" "}
            {plural(inspections.length, "inspection")} this week
          </>
        }
      />

      {data.activeCount === 0 ? (
        <EmptyTracker />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Stage"
            className="-mt-1 flex gap-2 overflow-x-auto px-6 pb-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t, i) => {
              const selected = t.id === tab;
              return (
                <button
                  key={t.id}
                  id={`tracker-tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="tracker-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className="group flex h-12 shrink-0 items-center rounded-full outline-none"
                >
                  <span
                    className={cn(
                      "flex h-10 items-center gap-1 rounded-full px-4 text-sm whitespace-nowrap group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary",
                      selected
                        ? "bg-primary font-bold text-white"
                        : "border border-line-strong bg-surface font-semibold text-text group-hover:bg-subtle",
                    )}
                  >
                    {t.label}
                    <span className={cn("font-medium tabular-nums", selected ? "opacity-75" : "text-text-3")}>
                      {count(t)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id="tracker-panel"
            role="tabpanel"
            aria-labelledby={`tracker-tab-${tab}`}
            className="flex flex-col gap-8 px-6 pb-8"
          >
            {showWeek && (
              <section aria-labelledby="this-week" className="flex flex-col gap-3">
                <h2 id="this-week" className="m-0 text-xs font-bold tracking-[0.06em] text-text-3 uppercase">
                  This week
                </h2>
                {inspections.map((l) => (
                  <InspectionCard key={l.id} listing={l} onLog={() => open("log", l)} />
                ))}
                {nudges.map((l) => (
                  <NudgeCard key={l.id} listing={l} now={loadedAt} onReplied={() => void run(l, { type: "replied" })} />
                ))}
              </section>
            )}

            {sections.map((s) => (
              <section key={s.tab} aria-labelledby={`stage-${s.tab}`} className="flex flex-col gap-1">
                <h2
                  id={`stage-${s.tab}`}
                  className="m-0 mb-2 text-xs font-bold tracking-[0.06em] text-text-3 uppercase"
                >
                  {s.label}
                </h2>
                {s.items.map((l) => (
                  <StageRow
                    key={l.id}
                    listing={l}
                    onMenu={() => open("actions", l)}
                    onReplied={() => void run(l, { type: "replied" })}
                  />
                ))}
              </section>
            ))}

            {sections.length === 0 && (
              <p className="m-0 rounded-3xl border border-line bg-surface p-6 text-[15px] leading-[1.6] font-medium text-text-2">
                Nothing in {TABS.find((t) => t.id === tab)?.label} right now.
              </p>
            )}
          </div>
        </>
      )}

      <RowActionsSheet
        listing={sheet?.kind === "actions" ? sheet.listing : null}
        onClose={close}
        onPick={(kind, l) => open(kind, l)}
        onMessage={(l) => messageFromShortlist(l)}
        onMarkMessaged={(l) => void run(l, { type: "messaged" })}
        onReplied={(l) => void run(l, { type: "replied" })}
        onNegotiate={(l) => void run(l, { type: "negotiate" })}
      />
      <BookInspectionSheet
        listing={sheet?.kind === "book" ? sheet.listing : null}
        onClose={close}
        onSubmit={(a) => run(sheet!.listing, a)}
      />
      <LogInspectionSheet
        listing={sheet?.kind === "log" ? sheet.listing : null}
        onClose={close}
        onSubmit={(a) => run(sheet!.listing, a)}
      />
      <DropSheet
        listing={sheet?.kind === "drop" ? sheet.listing : null}
        onClose={close}
        onSubmit={(a) => run(sheet!.listing, a)}
      />
      <OfferSheet
        listing={sheet?.kind === "offer" ? sheet.listing : null}
        onClose={close}
        onSubmit={(a) => run(sheet!.listing, a)}
      />
      <GotItSheet
        listing={sheet?.kind === "gotit" ? sheet.listing : null}
        onClose={close}
        onSubmit={(a) => run(sheet!.listing, a)}
      />
    </>
  );
}

/** This week: a booked inspection with its Lagos date block, Message and Log inspection. */
function InspectionCard({ listing: l, onLog }: { listing: ListingDetail; onLog: () => void }) {
  const at = new Date(l.inspection_at!);
  const phone = firstPhone(l.phone);
  const price = formatPrice(l);
  return (
    <article className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(14,34,38,0.04)]">
      <div className="flex items-center gap-4">
        <time
          dateTime={l.inspection_at!}
          className="flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-primary leading-none text-white"
        >
          <span className="text-[11px] font-extrabold tracking-[0.08em] text-[#CFE3E1] uppercase">
            {formatLagos(at, "dayShort")}
          </span>
          <span className="text-2xl font-extrabold tabular-nums">{formatLagos(at, "dayNum")}</span>
        </time>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[13px] font-bold text-primary tabular-nums">Inspection · {formatLagos(at, "time")}</span>
          <Link
            href={`/listing/${encodeURIComponent(l.id)}`}
            className="truncate text-[17px] leading-[1.3] font-bold tracking-[-0.01em] text-text no-underline hover:underline"
          >
            {formatHomeTitle(l)}
          </Link>
          <span className="truncate text-sm font-medium text-text-2 tabular-nums">
            {price ? `${price} · ` : ""}
            {handleOf(l)}
          </span>
        </div>
      </div>
      <div className="flex gap-3">
        {phone ? (
          <a
            href={whatsappUrl(phone)}
            target="_blank"
            rel="noopener"
            className={cn(buttonVariants({ variant: "outline" }), "flex-1 text-sm font-bold no-underline")}
          >
            Message
          </a>
        ) : (
          <a
            href={l.url}
            target="_blank"
            rel="noopener"
            className={cn(buttonVariants({ variant: "outline" }), "flex-1 text-sm font-bold no-underline")}
          >
            Open on TikTok
          </a>
        )}
        <Button className="flex-1 text-sm" onClick={onLog}>
          Log inspection
        </Button>
      </div>
    </article>
  );
}

/** This week: a Messaged listing with no reply for nudge_days. Nudge opens WhatsApp with a short follow-up. */
function NudgeCard({ listing: l, now, onReplied }: { listing: ListingDetail; now: number; onReplied: () => void }) {
  const since = l.status_changed_at ? Date.parse(l.status_changed_at) : now;
  const days = Math.max(1, Math.floor((now - since) / DAY_MS));
  const wa = waLink(l.phone, nudgeMessage(l));
  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-line bg-surface px-5 py-4">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-needs-tint text-needs-ink"
        >
          <Clock className="size-5" strokeWidth={1.8} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-bold text-text">No reply in {plural(days, "day")}</span>
          <Link
            href={`/listing/${encodeURIComponent(l.id)}`}
            className="truncate text-sm font-medium text-text-2 no-underline hover:underline"
          >
            {formatHomeTitle(l)}
          </Link>
        </div>
        <a
          href={wa ?? l.url}
          target="_blank"
          rel="noopener"
          className={cn(buttonVariants({ variant: "outline" }), "px-4 text-sm font-bold no-underline")}
        >
          {wa ? "Nudge" : "Open on TikTok"}
        </a>
      </div>
      <Button variant="secondary" className="ml-15 self-start text-sm font-bold" onClick={onReplied}>
        <Check aria-hidden />
        Agent replied
      </Button>
    </article>
  );
}

/** Stage-specific second line of a row. */
function RowMeta({ listing: l }: { listing: ListingDetail }) {
  const price = formatPrice(l);
  const lead = price ? `${price} · ` : "";
  switch (l.status) {
    case "messaged":
      if (l.replied_at) {
        return (
          <span className="flex items-center gap-1 text-sm font-bold text-good-ink">
            <Check aria-hidden className="size-4" strokeWidth={2.2} />
            Agent replied {formatAge(l.replied_at)}
          </span>
        );
      }
      return (
        <span className="truncate text-sm font-medium text-text-2 tabular-nums">
          {lead}messaged {l.status_changed_at ? formatAge(l.status_changed_at) : ""}
        </span>
      );
    case "inspection_booked":
      return (
        <span className="truncate text-sm font-semibold text-primary tabular-nums">
          {l.inspection_at ? `Inspection ${inspectionWhen(l.inspection_at)}` : "Inspection booked"}
        </span>
      );
    case "inspected":
      return (
        <span className="truncate text-sm font-medium text-text-2">
          Inspected{l.power_confirmed ? ` · power: ${l.power_confirmed}` : ""}
        </span>
      );
    case "negotiating":
      return (
        <span className="text-sm font-medium text-text-2 tabular-nums">
          {l.price_ngn !== null ? `Asking ${formatNaira(l.price_ngn)}` : "No asking price"}
          {" · "}
          {l.offer_ngn !== null ? (
            <span className="font-bold text-text">your offer {formatNaira(l.offer_ngn)}</span>
          ) : (
            "no offer yet"
          )}
          {l.counter_ngn !== null && ` · counter ${formatNaira(l.counter_ngn)}`}
        </span>
      );
    default:
      return (
        <span className="truncate text-sm font-medium text-text-2 tabular-nums">
          {lead}
          {l.status_changed_at ? `shortlisted ${formatAge(l.status_changed_at)}` : handleOf(l)}
        </span>
      );
  }
}

/** A listing in a stage list: cover, title and the stage's line link to the listing; ⋯ opens its actions. */
function StageRow({
  listing: l,
  onMenu,
  onReplied,
}: {
  listing: ListingDetail;
  onMenu: () => void;
  onReplied: () => void;
}) {
  const title = formatHomeTitle(l);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <Link
          href={`/listing/${encodeURIComponent(l.id)}`}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl py-3 text-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Cover listingId={l.id} className="h-16 w-12 shrink-0 rounded-xl" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-base leading-[1.3] font-bold text-text">{title}</span>
            <RowMeta listing={l} />
          </span>
        </Link>
        <button
          type="button"
          aria-label={`Actions for ${title}`}
          aria-haspopup="dialog"
          onClick={onMenu}
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Ellipsis aria-hidden className="size-[22px]" strokeWidth={1.8} />
        </button>
      </div>
      {l.status === "messaged" && !l.replied_at && (
        <Button variant="secondary" className="mb-2 ml-16 self-start text-sm font-bold" onClick={onReplied}>
          <Check aria-hidden />
          Agent replied
        </Button>
      )}
    </div>
  );
}

/** ⋯ on a row: only the actions valid for the listing's stage. */
function RowActionsSheet({
  listing,
  onClose,
  onPick,
  onMessage,
  onMarkMessaged,
  onReplied,
  onNegotiate,
}: {
  listing: ListingDetail | null;
  onClose: () => void;
  onPick: (kind: Exclude<SheetKind, "actions">, l: ListingDetail) => void;
  onMessage: (l: ListingDetail) => void;
  onMarkMessaged: (l: ListingDetail) => void;
  onReplied: (l: ListingDetail) => void;
  onNegotiate: (l: ListingDetail) => void;
}) {
  return (
    <TrackerSheet
      listing={listing}
      onClose={onClose}
      title={(l) => formatHomeTitle(l)}
      description={(l) => `${LISTING_STATUS_LABEL[l.status]} · ${handleOf(l)}`}
    >
      {(l) => {
        const item = "w-full justify-start";
        const hasWa = waLink(l.phone, firstMessage(l)) !== null;
        return (
          <div className="flex flex-col gap-3">
            {l.status === "shortlisted" && (
              <>
                {hasWa && (
                  <Button className={item} onClick={() => onMessage(l)}>
                    <MessageCircle aria-hidden />
                    Message on WhatsApp
                  </Button>
                )}
                <Button variant="outline" className={item} onClick={() => onMarkMessaged(l)}>
                  <Check aria-hidden />
                  Mark as messaged
                </Button>
              </>
            )}
            {l.status === "messaged" && (
              <>
                <Button className={item} onClick={() => onPick("book", l)}>
                  <CalendarPlus aria-hidden />
                  Book inspection
                </Button>
                {!l.replied_at && (
                  <Button variant="secondary" className={item} onClick={() => onReplied(l)}>
                    <Check aria-hidden />
                    Agent replied
                  </Button>
                )}
              </>
            )}
            {l.status === "inspection_booked" && (
              <>
                <Button className={item} onClick={() => onPick("log", l)}>
                  <ClipboardCheck aria-hidden />
                  Log inspection
                </Button>
                <Button variant="outline" className={item} onClick={() => onPick("book", l)}>
                  <CalendarClock aria-hidden />
                  Change inspection time
                </Button>
              </>
            )}
            {l.status === "inspected" && (
              <Button className={item} onClick={() => onNegotiate(l)}>
                <HandCoins aria-hidden />
                Negotiate
              </Button>
            )}
            {l.status === "negotiating" && (
              <>
                <Button className={item} onClick={() => onPick("gotit", l)}>
                  <House aria-hidden />
                  Got it
                </Button>
                <Button variant="outline" className={item} onClick={() => onPick("offer", l)}>
                  <HandCoins aria-hidden />
                  {l.offer_ngn !== null || l.counter_ngn !== null ? "Update offer" : "Log offer"}
                </Button>
              </>
            )}
            <Link
              href={`/listing/${encodeURIComponent(l.id)}`}
              className={cn(buttonVariants({ variant: "outline" }), item, "no-underline")}
            >
              <ExternalLink aria-hidden />
              Open listing
            </Link>
            <Button variant="destructive" className={item} onClick={() => onPick("drop", l)}>
              <X aria-hidden />
              Drop
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Cancel
            </Button>
          </div>
        );
      }}
    </TrackerSheet>
  );
}

function EmptyTracker() {
  return (
    <section
      aria-labelledby="tracker-empty-title"
      className="mx-6 flex flex-col items-center gap-6 rounded-3xl border border-line bg-surface px-6 py-12 text-center"
    >
      <div className="flex flex-col gap-2">
        <h2 id="tracker-empty-title" className="m-0 text-xl font-bold tracking-[-0.01em] text-text">
          Nothing to track yet
        </h2>
        <p className="m-0 text-[15px] leading-[1.6] font-medium text-text-2">
          Shortlist or message a listing from your Inbox and it shows up here.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        <InboxIcon aria-hidden />
        Go to Inbox
      </Link>
    </section>
  );
}

export function TrackerSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading your tracker</span>
      <ScreenHeader
        title="Tracker"
        subtitle={<span className="inline-block h-4 w-48 animate-pulse rounded-md bg-muted align-middle" />}
      />
      <div className="flex gap-2 px-6 pb-8">
        {[64, 120, 112, 116].map((w) => (
          <Skeleton key={w} className="h-10 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="flex flex-col gap-3 px-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-[172px] w-full rounded-3xl" />
        <Skeleton className="h-[76px] w-full rounded-3xl" />
      </div>
    </div>
  );
}
