"use client";

import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ListingDetail } from "@/lib/types";

/** Shared look for text inputs in the tracker sheets: 48px tall, radius 16, 2px primary focus ring. */
export const FIELD_CLASS =
  "h-12 w-full rounded-2xl border border-line-strong bg-surface px-4 text-[15px] font-medium text-text tabular-nums placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-invalid:border-needs";

export const LABEL_CLASS = "text-sm font-semibold text-text-2";

interface TrackerSheetProps {
  /** The listing the sheet acts on; null closes it. */
  listing: ListingDetail | null;
  onClose: () => void;
  title: (l: ListingDetail) => ReactNode;
  description?: (l: ListingDetail) => ReactNode;
  /** Body; keyed by listing id by the caller when its form state must reset per listing. */
  children: (l: ListingDetail) => ReactNode;
}

/** Bottom sheet frame used by every tracker sheet. Keeps the last listing visible while it animates closed. */
export function TrackerSheet({ listing, onClose, title, description, children }: TrackerSheetProps) {
  const [shown, setShown] = useState<ListingDetail | null>(listing);
  if (listing && listing !== shown) setShown(listing);
  const current = listing ?? shown;

  return (
    <Sheet open={listing !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[90dvh] max-w-[480px] gap-0 overflow-y-auto rounded-t-3xl border-line bg-surface px-6 pt-2"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        <span aria-hidden className="mt-1 h-1 w-10 self-center rounded-sm bg-line-strong" />
        {current && (
          <>
            <SheetHeader className="gap-1 px-0 pt-4 pb-6">
              <SheetTitle className="text-[19px] leading-[1.3] font-bold tracking-[-0.01em] text-text">
                {title(current)}
              </SheetTitle>
              {description && (
                <SheetDescription className="text-sm leading-[1.5] font-medium text-text-2">
                  {description(current)}
                </SheetDescription>
              )}
            </SheetHeader>
            {children(current)}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}
