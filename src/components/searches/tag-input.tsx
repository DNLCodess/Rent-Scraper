"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

interface Props {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  max: number;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  /** Canonical form of a chip (e.g. "LagosApartments" → "#lagosapartments"); null drops it. */
  normalize?: (text: string) => string | null;
}

/**
 * Chip input: Enter or comma adds a chip, Backspace on empty input removes the last one.
 * Text still in the box is added on blur so it isn't lost when the form is submitted.
 * Chips are 36px tall; each remove button has a 44px hit area.
 */
export function TagInput({ id, value, onChange, max, placeholder, describedBy, invalid, normalize }: Props) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const parts = text
      .split(",")
      .map((t) => (normalize ? normalize(t) : t.trim()))
      .filter((t): t is string => !!t);
    const next = [...value];
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft("");
  }

  const full = value.length >= max;

  return (
    <div
      className="flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-surface px-2 py-[5px] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary data-[invalid=true]:border-needs"
      data-invalid={invalid || undefined}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-9 items-center gap-0.5 rounded-full bg-primary-tint pl-3 text-sm font-semibold text-primary"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="relative flex size-9 items-center justify-center rounded-full text-primary/80 after:absolute after:-inset-1 hover:text-primary"
            aria-label={`Remove ${tag}`}
          >
            <XIcon aria-hidden className="size-4" strokeWidth={1.8} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={full}
        placeholder={full ? `Up to ${max}` : value.length ? "Add another" : placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="done"
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) commit(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        className="h-9 min-w-32 flex-1 bg-transparent px-2 text-[15px] font-medium text-text outline-none placeholder:text-text-3 disabled:cursor-not-allowed"
      />
    </div>
  );
}
