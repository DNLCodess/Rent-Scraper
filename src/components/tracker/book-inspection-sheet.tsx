"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatHomeTitle } from "@/lib/format";
import { formatLagos, lagosDayKey, lagosLocalToIso } from "@/lib/time";
import type { ListingAction, ListingDetail } from "@/lib/types";
import { FIELD_CLASS, LABEL_CLASS, TrackerSheet } from "./tracker-sheet";

const DAY_MS = 86_400_000;
const DEFAULT_TIME = "10:00";

interface BookInspectionSheetProps {
  listing: ListingDetail | null;
  onClose: () => void;
  onSubmit: (action: ListingAction) => Promise<boolean>;
}

/** Date + time of an inspection, entered and shown in Lagos time. Also reschedules a booked one. */
export function BookInspectionSheet({ listing, onClose, onSubmit }: BookInspectionSheetProps) {
  return (
    <TrackerSheet
      listing={listing}
      onClose={onClose}
      title={(l) => (l.status === "inspection_booked" ? "Change inspection time" : "Book inspection")}
      description={(l) => formatHomeTitle(l)}
    >
      {(l) => <BookForm key={l.id} listing={l} onClose={onClose} onSubmit={onSubmit} />}
    </TrackerSheet>
  );
}

function BookForm({
  listing,
  onClose,
  onSubmit,
}: {
  listing: ListingDetail;
  onClose: () => void;
  onSubmit: (action: ListingAction) => Promise<boolean>;
}) {
  const [now] = useState(() => new Date());
  const booked = listing.inspection_at ? new Date(listing.inspection_at) : null;
  const [date, setDate] = useState(() => lagosDayKey(booked ?? new Date(now.getTime() + DAY_MS)));
  const [time, setTime] = useState(() => (booked ? formatLagos(booked, "time") : DEFAULT_TIME));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const at = lagosLocalToIso(date, time);
    if (!at) {
      setError("Pick a date and a time.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ type: "book_inspection", at });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-[3] flex-col gap-2">
          <label htmlFor="inspection-date" className={LABEL_CLASS}>
            Date
          </label>
          <input
            id="inspection-date"
            type="date"
            required
            min={lagosDayKey(now)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-[2] flex-col gap-2">
          <label htmlFor="inspection-time" className={LABEL_CLASS}>
            Time
          </label>
          <input
            id="inspection-time"
            type="time"
            required
            step={300}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={FIELD_CLASS}
          />
        </div>
      </div>
      <p className="-mt-3 text-[13px] font-medium text-text-3">Lagos time (WAT)</p>
      {error && (
        <p role="alert" className="-mt-3 text-sm font-semibold text-needs-ink">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Saving…" : listing.status === "inspection_booked" ? "Save new time" : "Book inspection"}
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
