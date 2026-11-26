"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatHomeTitle } from "@/lib/format";
import type { ListingAction, ListingDetail } from "@/lib/types";
import { TrackerSheet } from "./tracker-sheet";

interface GotItSheetProps {
  listing: ListingDetail | null;
  onClose: () => void;
  onSubmit: (action: ListingAction) => Promise<boolean>;
}

/** Confirms the end of the hunt: this listing becomes the new place, the rest are archived. */
export function GotItSheet({ listing, onClose, onSubmit }: GotItSheetProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit({ type: "got_it" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <TrackerSheet
      listing={listing}
      onClose={onClose}
      title={(l) => formatHomeTitle(l)}
      description={() =>
        "Mark this as your new place? Your other listings will be archived and daily searches paused."
      }
    >
      {() => (
        <div className="flex flex-col gap-3">
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Saving…" : "Got it"}
          </Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </TrackerSheet>
  );
}
