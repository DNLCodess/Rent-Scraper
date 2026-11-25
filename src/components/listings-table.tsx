"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBeds, formatCount, formatDate, formatPrice, whatsappUrl } from "@/lib/format";
import type { Listing } from "@/lib/types";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Couldn't copy. Select the number and copy it manually.");
  }
}

const muted = <span className="text-muted-foreground">—</span>;

// Nulls (e.g. missing price) are returned as undefined so they always sort last.
const columns: ColumnDef<Listing>[] = [
  {
    id: "creator",
    header: "Creator",
    accessorFn: (l) => l.author,
    enableSorting: false,
    cell: ({ row: { original: l } }) => (
      <div className="max-w-72 min-w-48 space-y-1">
        <div className="flex items-center gap-2">
          <a
            href={`https://www.tiktok.com/@${l.author}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline-offset-4 hover:underline"
          >
            @{l.author}
          </a>
          {l.seen_before && (
            <Badge variant="outline" title="Also found by an earlier run">
              Seen before
            </Badge>
          )}
        </div>
        <p className="line-clamp-2 text-xs whitespace-normal text-muted-foreground" title={l.caption}>
          {l.caption || "No caption"}
        </p>
      </div>
    ),
  },
  {
    id: "price",
    header: "Price",
    accessorFn: (l) => l.price_ngn ?? undefined,
    sortUndefined: "last",
    cell: ({ row: { original: l } }) =>
      l.price_ngn === null ? (
        <span className="text-muted-foreground">No price</span>
      ) : (
        <span className="font-medium tabular-nums" title={l.price_raw ?? undefined}>
          {formatPrice(l)}
        </span>
      ),
  },
  {
    id: "area",
    header: "Area",
    accessorFn: (l) => l.area ?? undefined,
    sortUndefined: "last",
    cell: ({ row: { original: l } }) => l.area ?? muted,
  },
  {
    id: "beds",
    header: "Beds",
    accessorFn: (l) => l.bedrooms ?? undefined,
    sortUndefined: "last",
    cell: ({ row: { original: l } }) => (l.bedrooms === null ? muted : formatBeds(l.bedrooms)),
  },
  {
    id: "contact",
    header: "Contact",
    enableSorting: false,
    cell: ({ row: { original: l } }) => {
      if (!l.phone) return muted;
      const phones = l.phone.split(", ");
      return (
        <div className="flex items-center gap-1">
          <a
            href={whatsappUrl(phones[0])}
            target="_blank"
            rel="noopener noreferrer"
            className="tabular-nums underline-offset-4 hover:underline"
            title="Open in WhatsApp"
          >
            {phones[0]}
          </a>
          {phones.length > 1 && (
            <span className="text-xs text-muted-foreground" title={phones.slice(1).join(", ")}>
              +{phones.length - 1}
            </span>
          )}
          <Button variant="ghost" size="icon-xs" onClick={() => copy(l.phone!)} aria-label={`Copy ${l.phone}`}>
            <CopyIcon />
          </Button>
        </div>
      );
    },
  },
  {
    id: "likes",
    header: "Likes",
    accessorFn: (l) => l.likes ?? undefined,
    sortUndefined: "last",
    cell: ({ row: { original: l } }) => <span className="tabular-nums">{formatCount(l.likes) || "—"}</span>,
  },
  {
    id: "posted",
    header: "Posted",
    accessorFn: (l) => l.posted_at ?? undefined,
    sortUndefined: "last",
    cell: ({ row: { original: l } }) => <span className="tabular-nums">{formatDate(l.posted_at) || "—"}</span>,
  },
  {
    id: "link",
    header: () => <span className="sr-only">Link</span>,
    enableSorting: false,
    cell: ({ row: { original: l } }) => (
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={l.url} target="_blank" rel="noopener noreferrer" />}
        aria-label={`Open video by @${l.author} on TikTok`}
      >
        Open
        <ExternalLinkIcon data-icon="inline-end" />
      </Button>
    ),
  },
];

export function ListingsTable({ data }: { data: Listing[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "posted", desc: true }]);
  // TanStack Table returns non-memoisable functions; React Compiler should skip this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (l) => l.id,
  });

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className="px-3"
                  >
                    {header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2.5"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUpIcon data-icon="inline-end" />
                        ) : sorted === "desc" ? (
                          <ArrowDownIcon data-icon="inline-end" />
                        ) : (
                          <ArrowUpDownIcon data-icon="inline-end" className="opacity-40" />
                        )}
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="px-3 py-3 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
