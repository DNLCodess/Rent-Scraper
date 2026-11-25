"use client";

import { useState } from "react";
import { Ban, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api/client";
import { formatHomeTitle } from "@/lib/format";
import { isCity } from "@/lib/parser";
import type { InboxItem } from "@/lib/types";

interface ListingMenuProps {
  /** The listing the menu was opened for; null closes the sheet. */
  item: InboxItem | null;
  /** Every listing currently in the Inbox, used to count what blocking hides. */
  items: InboxItem[];
  onClose: () => void;
  /** Called after a group action changed the Inbox, so it can reload. */
  onChanged: () => void;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Whether "Dismiss all in {area}" makes sense: the area is a real neighbourhood, not a city or unknown. */
export function hasDismissableArea(item: Pick<InboxItem, "area">): item is { area: string } {
  return !!item.area && !isCity(item.area);
}

/** ⋯ menu on a reel card: dismiss all from the agent, dismiss all in the area, block the agent. */
export function ListingMenu({ item, items, onClose, onChanged }: ListingMenuProps) {
  const [busy, setBusy] = useState(false);
  // Keep showing the last listing while the sheet animates closed.
  const [shown, setShown] = useState<InboxItem | null>(item);
  if (item && item !== shown) setShown(item);
  const current = item ?? shown;

  async function run(work: () => Promise<string>) {
    setBusy(true);
    try {
      toast(await work());
      onClose();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const handle = current ? `@${current.author.replace(/^@+/, "")}` : "";

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-[480px] gap-0 rounded-t-3xl border-line px-6 pt-2"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        {current && (
          <>
            <SheetHeader className="gap-1 px-0 pt-4 pb-4">
              <SheetTitle className="text-[17px] font-bold text-text">{formatHomeTitle(current)}</SheetTitle>
              <SheetDescription className="text-sm font-medium text-text-2">From {handle}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const { changed } = await api<{ changed: number }>("/api/listings/dismiss-where", {
                      method: "POST",
                      body: JSON.stringify({ author: current.author }),
                    });
                    return `Dismissed ${plural(changed, "listing")} from ${handle}`;
                  })
                }
              >
                <X aria-hidden />
                Dismiss all from {handle}
              </Button>
              {hasDismissableArea(current) && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const { changed } = await api<{ changed: number }>("/api/listings/dismiss-where", {
                        method: "POST",
                        body: JSON.stringify({ area: current.area }),
                      });
                      return `Dismissed ${plural(changed, "listing")} in ${current.area}`;
                    })
                  }
                >
                  <MapPin aria-hidden />
                  Dismiss all in {current.area}
                </Button>
              )}
              <Button
                variant="destructive"
                className="w-full justify-start"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const key = current.author.replace(/^@+/, "").toLowerCase();
                    const hidden = items.filter((i) => i.author.replace(/^@+/, "").toLowerCase() === key).length;
                    await api("/api/preferences/blocked", {
                      method: "POST",
                      body: JSON.stringify({ handle: current.author }),
                    });
                    return `Blocked ${handle}. ${plural(hidden, "listing")} hidden`;
                  })
                }
              >
                <Ban aria-hidden />
                Block {handle}
              </Button>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
