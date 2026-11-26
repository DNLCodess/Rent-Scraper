"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Check, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/app/screen-header";
import { notifyInboxChanged } from "@/components/app/tab-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api/client";
import { formatAge } from "@/lib/format";
import { yearlyRent } from "@/lib/parser";
import { cardPatches, pickEditable, type CardId, type Editable } from "@/lib/criteria";
import type { BedOption, PowerMode, Preferences } from "@/lib/preferences";
import type { InboxItem, InboxResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AreasCard } from "./area-chips";
import { BudgetCard } from "./budget-card";
import { CriteriaCard } from "./criteria-card";

const SAVE_DEBOUNCE_MS = 400;
/** At most one "Saved" toast in this window, so dragging the slider doesn't stack them. */
const SAVED_TOAST_GAP_MS = 3000;

interface Blocked {
  handle: string;
  blockedAt: string;
  hiddenCount: number;
}

interface Counts {
  matchCount: number;
  hiddenCount: number;
}

interface Loaded {
  huntState: Preferences["huntState"];
  blocked: Blocked[];
  prices: number[];
  counts: Counts;
}

const BEDS: { value: BedOption; label: string }[] = [
  { value: "0", label: "Studio" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4+", label: "4+" },
];

const POWER: { value: PowerMode; label: string; effect: string }[] = [
  { value: "ignore", label: "Don't mind", effect: "Power doesn't affect order." },
  { value: "rank", label: "Rank it higher", effect: "24/7 and Band A first. Unknown still shows." },
  { value: "require", label: "Must be mentioned", effect: "Hides most listings; few captions say." },
];

/** The server's values for the keys a patch sent. */
function pickCard(saved: Preferences, patch: Partial<Editable>): Partial<Editable> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as (keyof Editable)[]) out[k] = saved[k];
  return out as Partial<Editable>;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** My criteria: what reaches the Inbox and in what order. Every change saves itself, 400ms after it settles. */
export function CriteriaForm() {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Editable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<CardId, string>>>({});
  const [reopening, setReopening] = useState(false);

  const draftRef = useRef<Editable | null>(null);
  /** What the server last confirmed; each save sends only what differs from it. */
  const savedRef = useRef<Editable | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Cards changed since the last flush. A card holding a rejected value isn't resent until it changes again. */
  const dirty = useRef<Set<CardId>>(new Set());
  /** Per-card save counter: only the newest save of a card may set its error or canonical values. */
  const cardSeq = useRef<Record<CardId, number>>({ budget: 0, beds: 0, areas: 0, power: 0 });
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastSavedToast = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const [prefs, blocked, inbox, hidden] = await Promise.all([
        api<Preferences>("/api/preferences"),
        api<Blocked[]>("/api/preferences/blocked"),
        api<InboxResponse>("/api/inbox"),
        api<Array<{ item: InboxItem; reason: string }>>("/api/inbox/hidden"),
      ]);
      const prices = [...inbox.items, ...hidden.map((h) => h.item)]
        .map((l) => yearlyRent(l.price_ngn, l.price_period))
        .filter((n): n is number => n !== null);
      draftRef.current = pickEditable(prefs);
      savedRef.current = draftRef.current;
      dirty.current.clear();
      setDraft(draftRef.current);
      setErrors({});
      setData({
        huntState: prefs.huntState,
        blocked,
        prices,
        counts: { matchCount: inbox.matchCount, hiddenCount: inbox.hiddenCount },
      });
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshCounts = useCallback(async () => {
    try {
      const inbox = await api<InboxResponse>("/api/inbox");
      setData((d) => d && { ...d, counts: { matchCount: inbox.matchCount, hiddenCount: inbox.hiddenCount } });
    } catch {
      // The banner is a summary; it catches up on the next save or visit.
    }
  }, []);

  /**
   * Saves each changed card on its own PUT, carrying only that card's changed keys, so a rejected field
   * never blocks another card and its message lands under the card that caused it. Saves run in order.
   */
  const flush = useCallback(() => {
    timer.current = null;
    const draftNow = draftRef.current;
    const savedNow = savedRef.current;
    if (!draftNow || !savedNow) return;
    const cards = [...dirty.current];
    dirty.current.clear();
    const patches = cardPatches(draftNow, savedNow, cards);
    // A card changed back to its saved value has nothing to send; its old error no longer applies.
    const unchanged = cards.filter((c) => !patches.some((p) => p.card === c));
    if (unchanged.length) {
      setErrors((e) => {
        const next = { ...e };
        for (const c of unchanged) delete next[c];
        return next;
      });
    }
    for (const { card, patch } of patches) {
      const seq = ++cardSeq.current[card];
      queue.current = queue.current.then(async () => {
        try {
          const saved = await api<Preferences>("/api/preferences", { method: "PUT", body: JSON.stringify(patch) });
          savedRef.current = pickEditable(saved);
          if (seq !== cardSeq.current[card]) return;
          // Take the server's canonical values for this card (e.g. "lekki" becomes "Lekki") unless it changed again.
          if (!dirty.current.has(card) && draftRef.current) {
            draftRef.current = { ...draftRef.current, ...pickCard(saved, patch) };
            setDraft(draftRef.current);
          }
          setErrors((e) => {
            const next = { ...e };
            delete next[card];
            return next;
          });
          const now = Date.now();
          if (now - lastSavedToast.current >= SAVED_TOAST_GAP_MS) {
            lastSavedToast.current = now;
            toast("Saved");
          }
          notifyInboxChanged();
          await refreshCounts();
        } catch (err) {
          if (seq !== cardSeq.current[card]) return;
          // Keep what the user entered; say what went wrong under the card that caused it.
          const message =
            err instanceof ApiError && err.status === 400 ? err.message : `Couldn't save. ${errorText(err)}`;
          setErrors((e) => ({ ...e, [card]: message }));
        }
      });
    }
  }, [refreshCounts]);

  // Leaving the page within the debounce window still saves the last change.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  function change(card: CardId, patch: Partial<Editable>) {
    if (!draftRef.current) return;
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
    dirty.current.add(card);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  async function unblock(handle: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      const blocked = await api<Blocked[]>(`/api/preferences/blocked?handle=${encodeURIComponent(handle)}`, {
        method: "DELETE",
      });
      setData((d) => d && { ...d, blocked });
      toast(`Unblocked @${handle}`, { description: "Their posts can reach your Inbox again." });
      notifyInboxChanged();
      await refreshCounts();
    } catch (err) {
      toast.error(`Couldn't unblock @${handle}. ${errorText(err)}`);
    } finally {
      busy.current = false;
    }
  }

  async function reopen() {
    if (reopening) return;
    setReopening(true);
    try {
      await api<Preferences>("/api/preferences", { method: "POST", body: JSON.stringify({ reopen: true }) });
      toast("Hunt reopened", { description: "Your tracker is back and daily searches resume." });
      notifyInboxChanged();
      await load();
    } catch (err) {
      toast.error(`Couldn't reopen the hunt. ${errorText(err)}`);
    } finally {
      setReopening(false);
    }
  }

  if (loadError && !data) {
    return (
      <>
        <CriteriaHeader />
        <div role="alert" className="mx-6 flex flex-col items-start gap-4 rounded-[24px] border border-line bg-surface p-6">
          <p className="m-0 text-[15px] leading-[1.6] font-medium text-text">
            Couldn&apos;t load your criteria. {loadError}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </>
    );
  }

  if (!data || !draft) return <CriteriaSkeleton />;

  return (
    <>
      <CriteriaHeader />

      {data.huntState === "done" && (
        <section
          aria-labelledby="hunt-done-h"
          className="mx-6 mb-4 flex flex-col gap-4 rounded-[24px] border border-line bg-surface px-5 py-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="hunt-done-h" className="m-0 text-[17px] font-bold text-text">
              Your hunt is finished
            </h2>
            <p className="m-0 text-[13px] leading-[1.5] font-medium text-text-3">
              Daily searches are paused and your tracker is archived. Reopen to pick up where you left off.
            </p>
          </div>
          <Button className="self-start" disabled={reopening} onClick={() => void reopen()}>
            Reopen hunt
          </Button>
        </section>
      )}

      <div className="mx-6 mb-8 flex items-center justify-between gap-4 rounded-[20px] bg-primary px-5 py-4 text-white">
        <p className="m-0 flex flex-col gap-1" aria-live="polite">
          <span className="text-[22px] font-extrabold tracking-[-0.02em] tabular-nums">
            {data.counts.matchCount} <span className="text-[15px] font-semibold">match</span>
          </span>
          <span className="text-[13px] font-medium text-[#CFE3E1] tabular-nums">
            {data.counts.hiddenCount} hidden by your rules
          </span>
        </p>
        <Link
          href="/criteria/hidden"
          className="flex h-12 shrink-0 items-center rounded-full bg-white/14 px-4 text-sm font-bold text-white no-underline hover:bg-white/20 focus-visible:outline-white"
        >
          See hidden
        </Link>
      </div>

      <div className="flex flex-col gap-4 px-6 pb-8">
        <BudgetCard
          min={draft.budgetMin}
          max={draft.budgetMax}
          prices={data.prices}
          error={errors.budget ?? null}
          onChange={(b) => change("budget", b)}
        />

        <CriteriaCard id="beds" title="Bedrooms" effect="Pick any that work. Others are hidden." error={errors.beds}>
          <div
            role="group"
            aria-labelledby="beds-h"
            className="grid grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))] gap-2"
          >
            {BEDS.map((b) => {
              const on = draft.beds.includes(b.value);
              return (
                <button
                  key={b.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={b.value === "0" ? "Studio" : `${b.label} bedroom${b.value === "1" ? "" : "s"}`}
                  onClick={() =>
                    change("beds", {
                      beds: on ? draft.beds.filter((x) => x !== b.value) : [...draft.beds, b.value],
                    })
                  }
                  className={cn(
                    "h-12 rounded-[14px] px-3 text-[15px] whitespace-nowrap tabular-nums",
                    on
                      ? "border-0 bg-primary font-bold text-white"
                      : "border border-line-strong bg-surface font-semibold text-text hover:bg-subtle",
                  )}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </CriteriaCard>

        <AreasCard
          preferred={draft.preferredAreas}
          excluded={draft.excludedAreas}
          error={errors.areas ?? null}
          onChange={(a) => change("areas", a)}
        />

        <CriteriaCard
          id="power"
          title="Power"
          effect="How much stable light should count."
          error={errors.power}
          icon={
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brass text-brass-ink"
            >
              <Lightbulb className="size-5" strokeWidth={1.8} />
            </span>
          }
        >
          <PowerRadios value={draft.powerMode} onChange={(powerMode) => change("power", { powerMode })} />
        </CriteriaCard>

        <BlockedCard blocked={data.blocked} onUnblock={(h) => void unblock(h)} />
      </div>
    </>
  );
}

function CriteriaHeader() {
  return (
    <ScreenHeader
      title="My criteria"
      subtitle="Decides what reaches your Inbox and in what order. Changes apply right away."
    />
  );
}

/** Power: three radio cards; arrow keys move the choice, as in a native radio group. */
function PowerRadios({ value, onChange }: { value: PowerMode; onChange: (v: PowerMode) => void }) {
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = POWER[(i + dir + POWER.length) % POWER.length];
    onChange(next.value);
    document.getElementById(`power-${next.value}`)?.focus();
  }
  return (
    <div role="radiogroup" aria-labelledby="power-h" className="flex flex-col gap-2">
      {POWER.map((p, i) => {
        const on = p.value === value;
        return (
          <button
            key={p.value}
            id={`power-${p.value}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(p.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-left",
              on ? "border-2 border-primary bg-[#EEF5F4]" : "border border-line-strong bg-surface hover:bg-subtle",
            )}
          >
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold text-text">{p.label}</span>
              <span className={cn("text-[13px] font-medium", on ? "text-text-2" : "text-text-3")}>{p.effect}</span>
            </span>
            {on && (
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-white"
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function BlockedCard({ blocked, onUnblock }: { blocked: Blocked[]; onUnblock: (handle: string) => void }) {
  return (
    <section
      aria-labelledby="blocked-h"
      className="flex flex-col gap-2 rounded-[24px] border border-line bg-surface px-5 pt-6 pb-3"
    >
      <div className="flex flex-col gap-1 pb-2">
        <h2 id="blocked-h" className="m-0 text-[17px] font-bold text-text">
          Blocked agents
        </h2>
        <p className="m-0 text-[13px] font-medium text-text-3">Their posts never reach your Inbox.</p>
      </div>
      {blocked.length === 0 ? (
        <p className="m-0 border-t border-[#E4EBE9] py-4 text-sm font-medium text-text-2">
          No blocked agents. Block one from the ⋯ menu on a listing in your Inbox.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {blocked.map((b) => (
            <li key={b.handle} className="flex min-h-14 items-center gap-3 border-t border-[#E4EBE9] py-2">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-[13px] font-extrabold text-text-2 uppercase"
              >
                {b.handle.charAt(0)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold text-text">@{b.handle}</span>
                <span className="text-[13px] font-medium text-text-3">
                  Blocked {formatAge(b.blockedAt)} · {plural(b.hiddenCount, "post")} hidden
                </span>
              </span>
              <Button
                variant="outline"
                className="px-4 text-[13px] font-bold"
                aria-label={`Unblock @${b.handle}`}
                onClick={() => onUnblock(b.handle)}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CriteriaSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading your criteria</span>
      <CriteriaHeader />
      <div className="flex flex-col gap-4 px-6">
        <Skeleton className="mb-4 h-[84px] w-full rounded-[20px]" />
        <Skeleton className="h-[340px] w-full rounded-[24px]" />
        <Skeleton className="h-[160px] w-full rounded-[24px]" />
      </div>
    </div>
  );
}
