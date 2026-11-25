"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bookmark, Check, X } from "lucide-react";
import { Cover } from "@/components/app/cover";
import { PowerTag } from "@/components/app/power-tag";
import { formatBedsShort, formatHomeTitle, formatNaira, formatPeriod, formatPower } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InboxItem } from "@/lib/types";

export type BatchType = "dismiss" | "shortlist";

interface GridProps {
  items: InboxItem[];
  /** The normal Inbox header, shown while nothing is selected. */
  header: ReactNode;
  /** Applies a batch action; resolves once the Inbox has been updated. */
  onBatch: (ids: string[], type: BatchType) => Promise<void>;
}

interface QuickChip {
  key: string;
  label: string;
  ids: string[];
}

function handleOf(author: string): string {
  return `@${author.replace(/^@+/, "")}`;
}

/** Up to 2 top agents and 2 top areas (each with 2+ listings), then "No price" and "Over 3 weeks". */
export function quickChips(items: InboxItem[]): QuickChip[] {
  const top = (key: (i: InboxItem) => string | null, prefix: string, label: (k: string) => string) => {
    const groups = new Map<string, string[]>();
    for (const i of items) {
      const k = key(i);
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), i.id]);
    }
    return [...groups.entries()]
      .filter(([, ids]) => ids.length >= 2)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .slice(0, 2)
      .map(([k, ids]) => ({ key: `${prefix}:${k}`, label: label(k), ids }));
  };
  const chips = [
    ...top((i) => i.author.replace(/^@+/, "").toLowerCase(), "author", handleOf),
    ...top(
      (i) => i.area,
      "area",
      (a) => a,
    ),
  ];
  const noPrice = items.filter((i) => i.price_ngn === null).map((i) => i.id);
  if (noPrice.length) chips.push({ key: "no-price", label: "No price", ids: noPrice });
  const old = items.filter((i) => i.probablyTaken).map((i) => i.id);
  if (old.length) chips.push({ key: "old", label: "Over 3 weeks", ids: old });
  return chips;
}

/** Two-column grid: tap tiles (or quick-select chips) to select, then dismiss or shortlist them together. */
export function Grid({ items, header, onBatch }: GridProps) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Ignore ids that have since left the Inbox.
  const selected = useMemo(() => new Set(items.filter((i) => picked.has(i.id)).map((i) => i.id)), [items, picked]);
  const chips = useMemo(() => quickChips(items), [items]);
  const n = selected.size;

  function toggle(id: string) {
    // Ids that left the Inbox may linger in `picked`; `selected` filters them out.
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleChip(chip: QuickChip) {
    setPicked((prev) => {
      const all = chip.ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of chip.ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function apply(type: BatchType) {
    if (n === 0 || busy) return;
    setBusy(true);
    try {
      await onBatch([...selected], type);
      setPicked(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {n > 0 ? (
        <header
          className="flex items-center justify-between"
          style={{ padding: "calc(16px + env(safe-area-inset-top)) 12px 16px" }}
        >
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="h-12 rounded-xl px-3 text-[15px] font-semibold text-text-2 hover:text-text"
          >
            Cancel
          </button>
          <h1 className="m-0 text-[17px] font-extrabold text-text tabular-nums" aria-live="polite">
            {n} selected
          </h1>
          <button
            type="button"
            onClick={() => setPicked(new Set(items.map((i) => i.id)))}
            disabled={n === items.length}
            className="h-12 rounded-xl px-3 text-[15px] font-bold text-primary disabled:text-text-3"
          >
            Select all
          </button>
        </header>
      ) : (
        header
      )}

      {chips.length > 0 && (
        <div className="flex flex-col gap-3 pt-2 pb-6">
          <p className="m-0 px-6 text-xs font-bold tracking-[0.06em] text-text-3 uppercase">Quick select</p>
          <div className="flex gap-2 overflow-x-auto px-6 py-1 [scrollbar-width:none]">
            {chips.map((chip) => {
              const on = chip.ids.every((id) => selected.has(id));
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleChip(chip)}
                  className={cn(
                    "relative h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1",
                    on
                      ? "border-[1.5px] border-primary bg-primary-tint font-bold text-primary"
                      : "border border-line-strong bg-surface font-semibold text-text",
                  )}
                >
                  {chip.label}{" "}
                  <span className={cn("font-medium tabular-nums", !on && "text-text-3")}>{chip.ids.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ul className="m-0 grid list-none auto-rows-[244px] grid-cols-2 gap-3 px-6 pt-1 pb-6">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <Tile item={item} selected={selected.has(item.id)} onToggle={() => toggle(item.id)} />
          </li>
        ))}
      </ul>

      {n > 0 && (
        // Sits above the tab bar (z-40) while selecting, with the same safe-area padding.
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface"
          style={{ paddingBottom: "calc(32px + env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-[480px] gap-3 px-6 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => apply("dismiss")}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-base font-bold text-text tabular-nums hover:bg-subtle disabled:opacity-50"
            >
              <X aria-hidden className="size-5" strokeWidth={1.8} />
              Dismiss {n}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply("shortlist")}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-white tabular-nums hover:bg-[#0B3B40] disabled:opacity-50"
            >
              <Bookmark aria-hidden className="size-5" strokeWidth={2.2} />
              Shortlist {n}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ item, selected, onToggle }: { item: InboxItem; selected: boolean; onToggle: () => void }) {
  const price = item.price_ngn === null ? null : formatNaira(item.price_ngn);
  const facts = [formatBedsShort(item.bedrooms), item.area].filter(Boolean).join(" · ");
  const label = [
    formatHomeTitle(item),
    price ? `${price} ${formatPeriod(item.price_period).replace("/ ", "per ")}` : "no price given",
    item.probablyTaken ? "probably taken" : null,
    selected ? "selected" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative block size-full overflow-hidden rounded-[20px] bg-(--cover) p-0 text-left",
        selected && "shadow-[0_0_0_3px_var(--ground),0_0_0_5px_var(--primary)]",
      )}
    >
      <Cover listingId={item.id} className="absolute inset-0" />
      {selected ? (
        <span className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-primary text-white shadow-[0_0_0_2px_#FFFFFF]">
          <Check aria-hidden className="size-4" strokeWidth={3} />
        </span>
      ) : (
        <span className="absolute top-3 right-3 size-7 rounded-full border-2 border-white bg-[rgba(14,34,38,0.35)]" />
      )}
      <span
        className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pt-12 pb-4 text-white"
        style={{ background: "linear-gradient(to bottom, rgba(14,34,38,0), rgba(14,34,38,0.92) 45%)" }}
      >
        {price ? (
          <span className="text-[19px] font-extrabold tracking-[-0.02em] tabular-nums">
            {price}{" "}
            <span className="text-xs font-medium tracking-normal text-[#CFDADA]">
              {formatPeriod(item.price_period, true)}
            </span>
          </span>
        ) : (
          <span className="text-[17px] font-extrabold tracking-[-0.02em]">No price</span>
        )}
        {facts && <span className="truncate text-[13px] font-semibold">{facts}</span>}
        {item.power_level !== "unknown" && (
          <PowerTag
            level={item.power_level}
            label={formatPower(item.power_level)}
            size="sm"
            className="mt-1 self-start"
          />
        )}
      </span>
    </button>
  );
}
