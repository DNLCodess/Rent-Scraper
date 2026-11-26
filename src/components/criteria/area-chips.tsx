"use client";

import { useId, useState, type ReactNode } from "react";
import { Plus, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { KNOWN_AREAS } from "@/lib/parser";
import { cn } from "@/lib/utils";
import { CriteriaCard } from "./criteria-card";

export type AreaList = "preferred" | "excluded";

const LISTS: Record<AreaList, { title: string; effect: string; chip: string; sheet: string }> = {
  preferred: {
    title: "Preferred",
    effect: "Ranked first in your Inbox.",
    chip: "bg-primary-tint text-primary",
    sheet: "Add a preferred area",
  },
  excluded: {
    title: "Never show",
    effect: "Hidden completely, wherever they come from.",
    chip: "bg-needs-tint text-needs-ink",
    sheet: "Add an area to never show",
  },
};

const SORTED_AREAS = [...KNOWN_AREAS].sort((a, b) => a.localeCompare(b));

interface AreasCardProps {
  preferred: string[];
  excluded: string[];
  /** Replaces both lists; an area is only ever in one of them. */
  onChange: (next: { preferredAreas: string[]; excludedAreas: string[] }) => void;
  error: string | null;
}

/** Areas: Preferred (primary-tint chips) and Never show (coral-tint chips), each with Add area. */
export function AreasCard({ preferred, excluded, onChange, error }: AreasCardProps) {
  const [adding, setAdding] = useState<AreaList | null>(null);
  const lists = { preferred, excluded };
  const lower = (s: string) => s.trim().toLowerCase();

  function remove(list: AreaList, area: string) {
    const next = lists[list].filter((a) => a !== area);
    onChange(
      list === "preferred"
        ? { preferredAreas: next, excludedAreas: excluded }
        : { preferredAreas: preferred, excludedAreas: next },
    );
  }

  function add(list: AreaList, area: string) {
    const name = area.trim();
    if (!name) return;
    const other: AreaList = list === "preferred" ? "excluded" : "preferred";
    const target = lists[list].some((a) => lower(a) === lower(name)) ? lists[list] : [...lists[list], name];
    const rest = lists[other].filter((a) => lower(a) !== lower(name));
    onChange(
      list === "preferred"
        ? { preferredAreas: target, excludedAreas: rest }
        : { preferredAreas: rest, excludedAreas: target },
    );
    setAdding(null);
  }

  return (
    <CriteriaCard id="areas" title="Areas" error={error} className="gap-6">
      <AreaGroup list="preferred" areas={preferred} onRemove={remove} onAdd={() => setAdding("preferred")} />
      <div aria-hidden className="h-px bg-[#E4EBE9]" />
      <AreaGroup list="excluded" areas={excluded} onRemove={remove} onAdd={() => setAdding("excluded")} />
      <AddAreaSheet
        list={adding}
        taken={adding ? lists[adding] : []}
        onClose={() => setAdding(null)}
        onPick={(area) => adding && add(adding, area)}
      />
    </CriteriaCard>
  );
}

function AreaGroup({
  list,
  areas,
  onRemove,
  onAdd,
}: {
  list: AreaList;
  areas: string[];
  onRemove: (list: AreaList, area: string) => void;
  onAdd: () => void;
}) {
  const meta = LISTS[list];
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={id} className="m-0 text-sm font-bold text-text">
          {meta.title}
        </h3>
        <p className="m-0 text-[13px] font-medium text-text-3">{meta.effect}</p>
      </div>
      <ul aria-labelledby={id} className="m-0 flex list-none flex-wrap gap-2 p-0">
        {areas.map((a) => (
          <li
            key={a}
            className={cn("inline-flex h-9 items-center gap-1 rounded-full pr-1 pl-3.5 text-sm font-bold", meta.chip)}
          >
            {a}
            {/* 28px glyph, 44px hit area; negative margins keep the chip 36px tall. */}
            <button
              type="button"
              aria-label={`Remove ${a}`}
              onClick={() => onRemove(list, a)}
              className="-my-1 -mr-1 flex size-11 items-center justify-center rounded-full bg-transparent text-current hover:bg-black/5"
            >
              <X aria-hidden className="size-3.5" strokeWidth={2.4} />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={onAdd}
            className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-[#A9B8B5] bg-transparent px-3.5 text-sm font-semibold text-text after:absolute after:-inset-y-1 after:inset-x-0 hover:bg-subtle"
          >
            <Plus aria-hidden className="size-4" strokeWidth={1.8} />
            Add area
          </button>
        </li>
      </ul>
    </div>
  );
}

const FIELD =
  "h-12 w-full rounded-[14px] border border-line-strong bg-surface pr-4 pl-11 text-[15px] font-medium text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Searchable list of the parser's known areas, plus free text. Serves both Preferred and Never show. */
function AddAreaSheet({
  list,
  taken,
  onClose,
  onPick,
}: {
  list: AreaList | null;
  taken: string[];
  onClose: () => void;
  onPick: (area: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [shownList, setShownList] = useState<AreaList | null>(list);
  if (list && list !== shownList) {
    setShownList(list);
    setQuery("");
  }
  const current = list ?? shownList;
  const q = query.trim().toLowerCase();
  const takenLower = new Set(taken.map((a) => a.toLowerCase()));
  const matches = SORTED_AREAS.filter((a) => !takenLower.has(a.toLowerCase()) && (!q || a.toLowerCase().includes(q)));
  const exact = SORTED_AREAS.some((a) => a.toLowerCase() === q) || takenLower.has(q);
  const searchId = useId();

  return (
    <Sheet open={list !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto flex h-[80dvh] max-w-[480px] flex-col gap-0 rounded-t-[24px] border-line bg-surface px-6 pt-2"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        <span aria-hidden className="mt-1 h-1 w-10 self-center rounded-sm bg-line-strong" />
        {current && (
          <>
            <SheetHeader className="gap-1 px-0 pt-4 pb-4">
              <SheetTitle className="text-[19px] leading-[1.3] font-bold tracking-[-0.01em] text-text">
                {LISTS[current].sheet}
              </SheetTitle>
              <SheetDescription className="text-sm leading-[1.5] font-medium text-text-2">
                {current === "preferred"
                  ? "Includes its neighbourhoods. If it's under Never show, it moves here."
                  : "Includes its neighbourhoods. If it's under Preferred, it moves here."}
              </SheetDescription>
            </SheetHeader>
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">
                Search areas
              </label>
              <Search
                aria-hidden
                className="pointer-events-none absolute top-3.5 left-4 size-5 text-text-3"
                strokeWidth={1.8}
              />
              <input
                id={searchId}
                type="text"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Search or type an area"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !q) return;
                  e.preventDefault();
                  onPick(matches.find((a) => a.toLowerCase() === q) ?? matches[0] ?? query);
                }}
                className={FIELD}
              />
            </div>
            <ul className="-mx-2 mt-3 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0">
              {q && !exact && (
                <li>
                  <AreaOption onClick={() => onPick(query)}>
                    <Plus aria-hidden className="size-5 text-primary" strokeWidth={1.8} />
                    Add &lsquo;{query.trim()}&rsquo;
                  </AreaOption>
                </li>
              )}
              {matches.map((a) => (
                <li key={a}>
                  <AreaOption onClick={() => onPick(a)}>{a}</AreaOption>
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="mt-3 w-full" onClick={onClose}>
              Cancel
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AreaOption({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 rounded-[14px] bg-transparent px-2 text-left text-[15px] font-semibold text-text hover:bg-subtle"
    >
      {children}
    </button>
  );
}
