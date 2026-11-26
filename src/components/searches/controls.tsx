"use client";

import type { ReactNode } from "react";
import type { RunStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Card frame shared by the Searches screen: radius 24, padding 20/24, subtle border. */
export function Card({
  id,
  title,
  effect,
  className,
  children,
}: {
  id?: string;
  title?: ReactNode;
  effect?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id && title ? `${id}-h` : undefined}
      className={cn("flex flex-col gap-5 rounded-[24px] border border-line bg-surface px-5 py-6", className)}
    >
      {title && (
        <div className="flex flex-col gap-1">
          <h2 id={id ? `${id}-h` : undefined} className="m-0 text-[17px] font-bold text-text">
            {title}
          </h2>
          {effect && <p className="m-0 text-[13px] leading-[1.5] font-medium text-text-3">{effect}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Section label: 12/700 uppercase, +0.06em, 12px above its content. */
export function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="m-0 mb-3 text-xs font-bold tracking-[0.06em] text-text-3 uppercase">
      {children}
    </h2>
  );
}

/**
 * On/off switch: the whole row is the control (≥48px tall), with the track on the right.
 * A real button with role="switch" and aria-checked, so it is keyboard operable.
 */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-2xl py-2 text-left disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-text">{label}</span>
        {description && (
          <span id={`${id}-d`} className="text-[13px] font-medium text-text-3">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-8 w-[52px] shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-6 rounded-full bg-surface shadow-sm transition-transform",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

/** Segmented single choice (e.g. videos per tag): arrow keys move the choice, as in a radio group. */
export function Segmented<T extends string | number>({
  id,
  labelledBy,
  options,
  value,
  onChange,
}: {
  id: string;
  labelledBy: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].value);
    document.getElementById(`${id}-${next}`)?.focus();
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-4 gap-2">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            id={`${id}-${i}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "h-12 rounded-[14px] px-3 text-[15px] tabular-nums",
              on
                ? "border-0 bg-primary font-bold text-white"
                : "border border-line-strong bg-surface font-semibold text-text hover:bg-subtle",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_CLASS: Record<RunStatus, string> = {
  queued: "bg-primary-tint text-primary",
  running: "bg-primary-tint text-primary",
  done: "bg-good-tint text-good-ink",
  failed: "bg-needs-tint text-needs-ink",
};

/** Run status as a pill: teal when done, coral when failed, lagoon while in progress. */
export function RunStatusPill({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-bold whitespace-nowrap",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Shared look for text inputs: 48px tall, radius 16, 2px primary focus ring. */
export const FIELD_CLASS =
  "h-12 w-full min-w-0 rounded-2xl border border-line-strong bg-surface px-4 text-[15px] font-medium text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const LABEL_CLASS = "text-sm font-semibold text-text-2";

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}
