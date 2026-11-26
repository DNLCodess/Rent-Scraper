"use client";

import { useId, useState, type ChangeEvent } from "react";
import { parseAmount } from "@/lib/filters";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CriteriaCard } from "./criteria-card";

export const BUDGET_STEP = 50_000;
const BINS = 12;
/** Fewer priced listings than this and the chart says so instead of drawing. */
const MIN_PRICES = 5;
/** Slider scale when there are no prices to base it on. */
const DEFAULT_TOP = 5_000_000;

const FIELD =
  "h-12 w-full min-w-0 rounded-[14px] border border-line-strong bg-surface px-4 text-[15px] font-semibold text-text tabular-nums placeholder:font-medium placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-invalid:border-needs";

const floorStep = (n: number) => Math.floor(n / BUDGET_STEP) * BUDGET_STEP;
const ceilStep = (n: number) => Math.ceil(n / BUDGET_STEP) * BUDGET_STEP;

function percentile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * Slider scale: the 5th–95th percentile of seen rents, snapped to ₦50k steps and widened so a saved
 * minimum/maximum is always a step inside the ends. The very ends mean "no minimum" / "no maximum".
 */
export function budgetScale(prices: number[], min: number | null, max: number | null): { lo: number; hi: number } {
  const sorted = [...prices].sort((a, b) => a - b);
  let lo = sorted.length >= MIN_PRICES ? floorStep(percentile(sorted, 0.05)) : 0;
  let hi = sorted.length >= MIN_PRICES ? ceilStep(percentile(sorted, 0.95)) : DEFAULT_TOP;
  if (min !== null) lo = Math.min(lo, Math.max(0, floorStep(min) - BUDGET_STEP));
  if (max !== null) hi = Math.max(hi, ceilStep(max) + BUDGET_STEP);
  if (min !== null) hi = Math.max(hi, ceilStep(min) + 2 * BUDGET_STEP);
  if (hi - lo < 2 * BUDGET_STEP) hi = lo + 2 * BUDGET_STEP;
  return { lo, hi };
}

/** 12 equal-width bins over the scale; outliers are clamped into the end bins. */
export function histogram(prices: number[], lo: number, hi: number): number[] {
  const bins = new Array<number>(BINS).fill(0);
  const width = (hi - lo) / BINS;
  for (const p of prices) {
    const i = Math.min(BINS - 1, Math.max(0, Math.floor((p - lo) / width)));
    bins[i]++;
  }
  return bins;
}

function rangeText(min: number | null, max: number | null): string {
  if (min === null && max === null) return "Any price";
  if (min === null) return `Up to ${formatNaira(max)}`;
  if (max === null) return `${formatNaira(min)} and up`;
  return `${formatNaira(min)} – ${formatNaira(max)}`;
}

const INVALID = "Enter an amount like 800k, 2m or 650,000.";

const amountText = (n: number | null) => (n === null ? "" : formatNaira(n));

interface BudgetCardProps {
  min: number | null;
  max: number | null;
  /** Yearly rents of every new listing seen, for the histogram. */
  prices: number[];
  onChange: (next: { budgetMin: number | null; budgetMax: number | null }) => void;
  /** Server message from the last failed save, shown under the card. */
  error: string | null;
}

/** Budget per year: histogram of seen rents, a 2-handle slider and Minimum/Maximum inputs that accept 800k / 2m. */
export function BudgetCard({ min, max, prices, onChange, error }: BudgetCardProps) {
  const id = useId();
  const [minText, setMinText] = useState(() => amountText(min));
  const [maxText, setMaxText] = useState(() => amountText(max));
  const [minError, setMinError] = useState<string | null>(null);
  const [maxError, setMaxError] = useState<string | null>(null);
  // Keep the text in step when the value changes from outside the inputs (slider, server canonical value).
  const [shown, setShown] = useState({ min, max });
  // Each field resyncs only when its own value changed, so moving one handle never wipes text typed in the other.
  if (shown.min !== min || shown.max !== max) {
    if (shown.min !== min && parseAmount(minText) !== (min ?? undefined) && !(min === null && minText.trim() === "")) {
      setMinText(amountText(min));
      setMinError(null);
    }
    if (shown.max !== max && parseAmount(maxText) !== (max ?? undefined) && !(max === null && maxText.trim() === "")) {
      setMaxText(amountText(max));
      setMaxError(null);
    }
    setShown({ min, max });
  }

  // The scale only ever widens while the card is open, so a thumb never jumps under the finger.
  const target = budgetScale(prices, min, max);
  const [scale, setScale] = useState(target);
  if (target.lo < scale.lo || target.hi > scale.hi) {
    setScale({ lo: Math.min(scale.lo, target.lo), hi: Math.max(scale.hi, target.hi) });
  }
  const lo = Math.min(scale.lo, target.lo);
  const hi = Math.max(scale.hi, target.hi);
  const enough = prices.length >= MIN_PRICES;
  const bins = enough ? histogram(prices, lo, hi) : [];
  const peak = Math.max(1, ...bins);
  const binWidth = (hi - lo) / BINS;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const minPos = min ?? lo;
  const maxPos = max ?? hi;

  function slideMin(e: ChangeEvent<HTMLInputElement>) {
    const v = Math.min(Number(e.target.value), maxPos - BUDGET_STEP);
    onChange({ budgetMin: v <= lo ? null : v, budgetMax: max });
  }

  function slideMax(e: ChangeEvent<HTMLInputElement>) {
    const v = Math.max(Number(e.target.value), minPos + BUDGET_STEP);
    onChange({ budgetMin: min, budgetMax: v >= hi ? null : v });
  }

  /** Parses a field: null for empty, undefined for text that isn't an amount. */
  function parseField(text: string): number | null | undefined {
    return text.trim() === "" ? null : parseAmount(text);
  }

  /** While typing: validate inline only. Saving waits for blur or Enter, so "2" on the way to "2m" is never saved. */
  function typed(which: "min" | "max", text: string) {
    (which === "min" ? setMinText : setMaxText)(text);
    (which === "min" ? setMinError : setMaxError)(parseField(text) === undefined ? INVALID : null);
  }

  /** On blur or Enter: save a valid amount and show it in the short form ("2000000" becomes "₦2m"). */
  function commit(which: "min" | "max") {
    const value = parseField(which === "min" ? minText : maxText);
    if (value === undefined) return;
    (which === "min" ? setMinText : setMaxText)(amountText(value));
    if (value === (which === "min" ? min : max)) return;
    onChange(which === "min" ? { budgetMin: value, budgetMax: max } : { budgetMin: min, budgetMax: value });
  }

  return (
    <CriteriaCard
      id="budget"
      title="Budget per year"
      effect='Over budget is hidden. No price is kept, marked "check manually".'
      error={error}
    >
      <div className="flex flex-col gap-3">
        <span className="text-2xl font-extrabold tracking-[-0.02em] text-text tabular-nums">{rangeText(min, max)}</span>
        {enough ? (
          // Price spread of the listings seen so far; bars inside the range are primary.
          <div aria-hidden className="flex h-14 items-end gap-1">
            {bins.map((count, i) => {
              const mid = lo + binWidth * (i + 0.5);
              const inRange = (min === null || mid >= min) && (max === null || mid <= max);
              return (
                <span
                  key={i}
                  className={cn("flex-1 rounded-[3px]", inRange ? "bg-primary" : "bg-line-strong")}
                  style={{ height: count === 0 ? 2 : `${Math.max(8, (count / peak) * 100)}%` }}
                />
              );
            })}
          </div>
        ) : (
          <p className="m-0 text-[13px] font-medium text-text-3">Not enough prices yet to chart.</p>
        )}
        <div className="dual-range relative h-12">
          {/* The 48px thumbs travel between 24px and width − 24px, so the track is inset to match. */}
          <span aria-hidden className="absolute inset-x-6 top-[23px] h-0.5 rounded-[1px] bg-line" />
          <span
            aria-hidden
            className="absolute top-[22px] h-1 rounded-sm bg-primary"
            style={{
              left: `calc(24px + (100% - 48px) * ${pct(minPos) / 100})`,
              right: `calc(24px + (100% - 48px) * ${1 - pct(maxPos) / 100})`,
            }}
          />
          <input
            type="range"
            aria-label="Minimum budget"
            aria-valuetext={min === null ? "No minimum" : formatNaira(min)}
            min={lo}
            max={hi}
            step={BUDGET_STEP}
            value={minPos}
            onChange={slideMin}
            // Past the middle the minimum thumb sits on top, so it can still be grabbed next to the maximum.
            style={{ zIndex: pct(minPos) > 50 ? 2 : 1 }}
          />
          <input
            type="range"
            aria-label="Maximum budget"
            aria-valuetext={max === null ? "No maximum" : formatNaira(max)}
            min={lo}
            max={hi}
            step={BUDGET_STEP}
            value={maxPos}
            onChange={slideMax}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AmountField
          id={`${id}-min`}
          label="Minimum"
          placeholder="No minimum"
          value={minText}
          error={minError}
          onChange={(t) => typed("min", t)}
          onCommit={() => commit("min")}
        />
        <AmountField
          id={`${id}-max`}
          label="Maximum"
          placeholder="No maximum"
          value={maxText}
          error={maxError}
          onChange={(t) => typed("max", t)}
          onCommit={() => commit("max")}
        />
      </div>
    </CriteriaCard>
  );
}

function AmountField({
  id,
  label,
  placeholder,
  value,
  error,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChange: (text: string) => void;
  /** Blur or Enter. */
  onCommit: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-xs font-bold text-text-3">
        {label}
      </label>
      <input
        id={id}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          }
        }}
        className={FIELD}
      />
      {error && (
        <p id={`${id}-error`} className="m-0 text-[13px] leading-[1.4] font-semibold text-needs-ink">
          {error}
        </p>
      )}
    </div>
  );
}
