"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatHomeTitle } from "@/lib/format";
import type { DropReason, ListingAction, ListingDetail } from "@/lib/types";
import { DropReasonList } from "./drop-sheet";
import { FIELD_CLASS, LABEL_CLASS, TrackerSheet } from "./tracker-sheet";

interface LogInspectionSheetProps {
  listing: ListingDetail | null;
  onClose: () => void;
  onSubmit: (action: ListingAction) => Promise<boolean>;
}

/** After an inspection: what the power was really like, a note, then Negotiate or Drop (with a reason). */
export function LogInspectionSheet({ listing, onClose, onSubmit }: LogInspectionSheetProps) {
  return (
    <TrackerSheet
      listing={listing}
      onClose={onClose}
      title={() => "Log inspection"}
      description={(l) => formatHomeTitle(l)}
    >
      {(l) => <LogForm key={l.id} onClose={onClose} onSubmit={onSubmit} />}
    </TrackerSheet>
  );
}

function LogForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (action: ListingAction) => Promise<boolean> }) {
  const [power, setPower] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "reason">("form");
  const [busy, setBusy] = useState(false);

  async function send(next: "negotiating" | "dropped", dropReason?: DropReason) {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit({
        type: "log_inspection",
        powerConfirmed: power.trim(),
        note: note.trim() || undefined,
        next,
        dropReason,
      });
    } finally {
      setBusy(false);
    }
  }

  if (step === "reason") {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[15px] font-bold text-text">Why drop it?</p>
        <DropReasonList onPick={(r) => void send("dropped", r)} disabled={busy} />
        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setStep("form")}>
          <ChevronLeft aria-hidden />
          Back
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void send("negotiating");
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="power-confirmed" className={LABEL_CLASS}>
          How was the power?
        </label>
        <input
          id="power-confirmed"
          type="text"
          value={power}
          onChange={(e) => setPower(e.target.value)}
          placeholder="e.g. Band A, about 20 hours a day"
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="inspection-note" className={LABEL_CLASS}>
          Notes
        </label>
        <textarea
          id="inspection-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. Water pressure weak upstairs"
          className="min-h-24 w-full resize-y rounded-2xl border border-line-strong bg-surface px-4 py-3 text-[15px] leading-[1.5] text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" className="flex-1" disabled={busy} onClick={() => setStep("reason")}>
          Drop
        </Button>
        <Button type="submit" size="lg" className="flex-1" disabled={busy}>
          {busy ? "Saving…" : "Negotiate"}
        </Button>
      </div>
      <Button type="button" variant="ghost" className="-mt-3 w-full" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </form>
  );
}
