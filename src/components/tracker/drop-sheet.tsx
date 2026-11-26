"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatHomeTitle } from "@/lib/format";
import type { DropReason, ListingAction, ListingDetail } from "@/lib/types";
import { TrackerSheet } from "./tracker-sheet";

export const DROP_REASON_LABEL: Record<DropReason, string> = {
  too_expensive: "Too expensive",
  bad_area: "Bad area",
  agent_ghosted: "Agent ghosted",
  fake_listing: "Fake listing",
  taken: "Taken",
  other: "Other",
};

const ORDER: DropReason[] = ["too_expensive", "bad_area", "agent_ghosted", "fake_listing", "taken", "other"];

/** One tap per reason, 48px tall each. */
export function DropReasonList({ onPick, disabled }: { onPick: (r: DropReason) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Reason" className="flex flex-col gap-2">
      {ORDER.map((r) => (
        <Button
          key={r}
          variant="outline"
          className="w-full justify-start"
          disabled={disabled}
          onClick={() => onPick(r)}
        >
          {DROP_REASON_LABEL[r]}
        </Button>
      ))}
    </div>
  );
}

interface DropSheetProps {
  listing: ListingDetail | null;
  onClose: () => void;
  onSubmit: (action: ListingAction) => Promise<boolean>;
}

/** Drop a listing at any stage with a one-tap reason. */
export function DropSheet({ listing, onClose, onSubmit }: DropSheetProps) {
  const [busy, setBusy] = useState(false);

  async function pick(reason: DropReason) {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit({ type: "drop", reason });
    } finally {
      setBusy(false);
    }
  }

  return (
    <TrackerSheet
      listing={listing}
      onClose={onClose}
      title={() => "Why drop it?"}
      description={(l) => formatHomeTitle(l)}
    >
      {() => (
        <div className="flex flex-col gap-3">
          <DropReasonList onPick={(r) => void pick(r)} disabled={busy} />
          <Button variant="ghost" className="w-full" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </TrackerSheet>
  );
}
