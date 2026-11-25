"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { Bookmark, Ellipsis, X } from "lucide-react";
import { Cover } from "@/components/app/cover";
import { PowerTag } from "@/components/app/power-tag";
import { formatHomeTitle, formatNaira, formatPeriod, formatPosted, formatPower } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InboxItem } from "@/lib/types";

export type ReelAction = "dismiss" | "shortlist";

interface ReelProps {
  item: InboxItem;
  /** Whether another listing waits behind this one (draws the stacked card). */
  hasNext: boolean;
  onAction: (item: InboxItem, action: ReelAction) => void;
  onMenu: (item: InboxItem) => void;
}

/** Horizontal distance (px) past which a swipe commits. */
const THRESHOLD = 96;
/** Movement (px) before a press becomes a drag rather than a tap. */
const DRAG_SLOP = 8;
const FLING_MS = 220;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** One listing per screen: cover with facts overlaid, swipe left to dismiss, right to shortlist. */
export function Reel(props: ReelProps) {
  // Keyed by id so each listing starts with a fresh gesture and commit state.
  return <ReelCard key={props.item.id} {...props} />;
}

/** Ignore button taps this soon after a card appears, so a double tap can't act on the next listing. */
const FRESH_CARD_MS = 300;

function ReelButtons({ onPress }: { onPress: (action: ReelAction) => void }) {
  return (
    <div className="flex gap-4 px-6 pt-8 pb-6">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onPress("dismiss")}
        className="flex size-16 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-text hover:bg-subtle"
      >
        <X aria-hidden className="size-6" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={() => onPress("shortlist")}
        className="flex h-16 flex-1 items-center justify-center gap-3 rounded-full bg-primary text-base font-bold text-white hover:bg-[#0B3B40]"
      >
        <Bookmark aria-hidden className="size-[22px]" strokeWidth={2.2} />
        Shortlist
      </button>
    </div>
  );
}

type Anim = "none" | "snap" | "fling";

function ReelCard({ item, hasNext, onAction, onMenu }: ReelProps) {
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState<Anim>("none");
  const dxRef = useRef(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragging = useRef(false);
  // Once a swipe or button press commits, every further gesture and tap on this card is ignored.
  const committed = useRef(false);
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  const title = formatHomeTitle(item);
  const price = item.price_ngn === null ? null : formatNaira(item.price_ngn);
  const period = formatPeriod(item.price_period);
  const handle = `@${item.author.replace(/^@+/, "")}`;

  function move(x: number) {
    dxRef.current = x;
    setDx(x);
  }

  function commit(action: ReelAction) {
    if (committed.current) return;
    committed.current = true;
    if (prefersReducedMotion()) {
      onAction(item, action);
      return;
    }
    setAnim("fling");
    move((action === "shortlist" ? 1 : -1) * (window.innerWidth + 120));
    window.setTimeout(() => onAction(item, action), FLING_MS);
  }

  function press(action: ReelAction) {
    if (performance.now() - shownAt.current < FRESH_CARD_MS) return;
    commit(action);
  }

  function snapBack() {
    setAnim("snap");
    move(0);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (committed.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragging.current = false;
    setAnim("none");
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!dragging.current) {
      if (Math.abs(mx) < DRAG_SLOP && Math.abs(my) < DRAG_SLOP) return;
      if (Math.abs(my) > Math.abs(mx)) {
        start.current = null; // a vertical scroll, not a swipe
        return;
      }
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    move(mx);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    if (!dragging.current) return;
    if (Math.abs(dxRef.current) >= THRESHOLD) commit(dxRef.current > 0 ? "shortlist" : "dismiss");
    else snapBack();
  }

  function onPointerCancel() {
    start.current = null;
    if (dragging.current) snapBack();
    dragging.current = false;
  }

  // A drag ends with a click on the link underneath; swallow it so a swipe never opens the listing.
  function onClickCapture(e: React.MouseEvent) {
    if (dragging.current || committed.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    dragging.current = false;
  }

  const progress = Math.min(1, Math.abs(dx) / THRESHOLD);
  const transition =
    anim === "fling"
      ? `transform ${FLING_MS}ms ease-in`
      : anim === "snap"
        ? "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)"
        : "none";

  return (
    <>
      <div className="relative mx-6 min-h-[360px] flex-1">
        {hasNext && (
          <div aria-hidden className="absolute inset-x-4 top-3 -bottom-2 rounded-[28px] border border-line bg-subtle" />
        )}
        <article
          aria-label={title}
          className="absolute inset-0 touch-pan-y overflow-hidden rounded-[28px] bg-(--cover) shadow-[0_12px_32px_rgba(14,34,38,0.14)] select-none motion-reduce:transition-none!"
          style={{ transform: `translateX(${dx}px) rotate(${dx / 24}deg)`, transition }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClickCapture={onClickCapture}
          onDragStart={(e) => e.preventDefault()}
        >
          <Cover listingId={item.id} className="absolute inset-0" />
          <Link
            href={`/listing/${encodeURIComponent(item.id)}`}
            aria-label={`Open listing: ${title}${price ? `, ${price} ${period.replace("/ ", "per ")}` : ""}`}
            className="absolute inset-0 rounded-[28px] focus-visible:outline-offset-[-4px]"
          />

          {/* Swipe hints, fading in as the card moves. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-20 left-6 rounded-full bg-primary px-4 py-2 text-[15px] font-bold text-white"
            style={{ opacity: dx > 0 ? progress : 0 }}
          >
            Shortlist
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute top-20 right-6 rounded-full bg-surface px-4 py-2 text-[15px] font-bold text-text"
            style={{ opacity: dx < 0 ? progress : 0 }}
          >
            Dismiss
          </span>

          <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {item.strongMatch && <Tag className="bg-surface text-text">Strong match</Tag>}
              {item.probablyTaken && <Tag className="bg-needs-tint text-needs-ink">Probably taken</Tag>}
              {item.checkManually && <Tag className="bg-subtle text-text">Check manually</Tag>}
            </div>
            <button
              type="button"
              aria-label={`More actions: dismiss all from ${handle} or this area, or block ${handle}`}
              aria-haspopup="dialog"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMenu(item)}
              className="pointer-events-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-[rgba(14,34,38,0.6)] text-white"
            >
              <Ellipsis aria-hidden className="size-[22px]" strokeWidth={1.8} />
            </button>
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-4 px-6 pt-20 pb-6 text-white"
            style={{
              background: "linear-gradient(to bottom, rgba(14,34,38,0), rgba(14,34,38,0.86) 36%, rgba(14,34,38,0.95))",
            }}
          >
            <div className="flex flex-col gap-2">
              {price ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[36px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                    {price}
                  </span>
                  <span className="text-[15px] font-medium text-[#CFDADA]">{period}</span>
                </div>
              ) : (
                <span className="text-[28px] leading-none font-extrabold tracking-[-0.02em]">No price given</span>
              )}
              <p className="m-0 text-lg leading-[1.3] font-bold tracking-[-0.01em]">{title}</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3 text-sm leading-[1.4]">
                <PowerTag level={item.power_level} label={formatPower(item.power_level)} />
                <span className="font-medium text-[#CFDADA]">{formatPosted(item)}</span>
              </div>
              <p className="m-0 text-[13px] leading-[1.4] font-medium text-[#AEBEBE]">{handle}</p>
            </div>
          </div>
        </article>
      </div>
      <ReelButtons onPress={press} />
    </>
  );
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-8 items-center rounded-2xl px-3 text-[13px] font-bold", className)}>
      {children}
    </span>
  );
}
