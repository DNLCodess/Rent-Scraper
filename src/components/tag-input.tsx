"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Props {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  max: number;
  placeholder?: string;
  describedBy?: string;
}

/**
 * Chip input: Enter or comma adds a chip, Backspace on empty input removes the last one.
 * Text still in the box is added on blur so it isn't lost when the form is submitted.
 */
export function TagInput({ id, value, onChange, max, placeholder, describedBy }: Props) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const parts = text.split(",").map((t) => t.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded-sm opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Remove ${tag}`}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        id={id}
        value={draft}
        aria-describedby={describedBy}
        disabled={value.length >= max}
        placeholder={value.length ? "" : placeholder}
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
        className="h-6 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
    </div>
  );
}
