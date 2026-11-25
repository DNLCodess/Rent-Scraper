"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activeFilterCount, EMPTY_FILTERS, type FilterState } from "@/lib/filters";
import { cn } from "@/lib/utils";

const BEDS = [
  { value: "any", label: "Any beds" },
  { value: "0", label: "Studio / self con" },
  { value: "1", label: "1 bed" },
  { value: "2", label: "2 beds" },
  { value: "3", label: "3 beds" },
  { value: "4+", label: "4+ beds" },
];

const AGE = [
  { value: "any", label: "Any time" },
  { value: "7", label: "Past week" },
  { value: "30", label: "Past month" },
  { value: "90", label: "Past 3 months" },
  { value: "365", label: "Past year" },
];

interface Props {
  value: FilterState;
  onChange: (f: FilterState) => void;
  areas: string[];
  /** "row" for the desktop filter bar, "stack" inside the mobile Sheet. */
  layout: "row" | "stack";
  idPrefix: string;
}

/** Filter controls. Each control has a label (visually hidden in the compact row layout). */
export function ListingFilters({ value, onChange, areas, layout, idPrefix }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const areaItems = [{ value: "any", label: "Any area" }, ...areas.map((a) => ({ value: a, label: a }))];
  const row = layout === "row";
  const labelClass = row ? "sr-only" : "";
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <div className={cn(row ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-4")}>
      <div className={cn("space-y-2", row && "min-w-48 flex-1 space-y-0")}>
        <Label htmlFor={id("q")} className={labelClass}>
          Search
        </Label>
        <Input
          id={id("q")}
          type="search"
          placeholder="Search captions, creators, phones"
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>
      <div className={cn("space-y-2", row && "space-y-0")}>
        <Label htmlFor={id("min")} className={labelClass}>
          Min price
        </Label>
        <Input
          id={id("min")}
          inputMode="decimal"
          placeholder="Min ₦ (e.g. 500k)"
          value={value.minPrice}
          onChange={(e) => set({ minPrice: e.target.value })}
          className={row ? "w-36" : ""}
        />
      </div>
      <div className={cn("space-y-2", row && "space-y-0")}>
        <Label htmlFor={id("max")} className={labelClass}>
          Max price
        </Label>
        <Input
          id={id("max")}
          inputMode="decimal"
          placeholder="Max ₦ (e.g. 2m)"
          value={value.maxPrice}
          onChange={(e) => set({ maxPrice: e.target.value })}
          className={row ? "w-36" : ""}
        />
      </div>
      <FilterSelect id={id("area")} label="Area" labelClass={labelClass} items={areaItems} value={value.area} onChange={(area) => set({ area })} row={row} />
      <FilterSelect id={id("beds")} label="Bedrooms" labelClass={labelClass} items={BEDS} value={value.beds} onChange={(beds) => set({ beds })} row={row} />
      <FilterSelect id={id("age")} label="Posted" labelClass={labelClass} items={AGE} value={value.age} onChange={(age) => set({ age })} row={row} />
      {activeFilterCount(value) > 0 && (
        <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  labelClass,
  items,
  value,
  onChange,
  row,
}: {
  id: string;
  label: string;
  labelClass: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  row: boolean;
}) {
  return (
    <div className={cn("space-y-2", row && "space-y-0")}>
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger id={id} className={row ? "w-36" : "w-full"} aria-label={row ? label : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
