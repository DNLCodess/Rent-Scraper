"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parseAmount } from "@/lib/filters";
import { formatHomeTitle, formatNaira } from "@/lib/format";
import type { ListingAction, ListingDetail } from "@/lib/types";
import { FIELD_CLASS, LABEL_CLASS, TrackerSheet } from "./tracker-sheet";

/** 6800000 -> "6.8m", 850000 -> "850k"; the same short forms the inputs accept. */
function toInput(n: number | null): string {
  if (n === null) return "";
  if (n >= 1_000_000 && n % 10_000 === 0) return `${n / 1_000_000}m`;
  if (n >= 1_000 && n % 1_000 === 0) return `${n / 1_000}k`;
  return String(n);
}

/** Empty -> null (cleared); invalid -> undefined. */
function readAmount(text: string): number | null | undefined {
  return text.trim() === "" ? null : parseAmount(text);
}

interface OfferSheetProps {
  listing: ListingDetail | null;
  onClose: () => void;
  onSubmit: (action: ListingAction) => Promise<boolean>;
}

/** Your offer and their counter while negotiating. Accepts "6.8m", "850k" or plain naira. */
export function OfferSheet({ listing, onClose, onSubmit }: OfferSheetProps) {
  return (
    <TrackerSheet
      listing={listing}
      onClose={onClose}
      title={() => "Offer"}
      description={(l) =>
        l.price_ngn !== null ? `${formatHomeTitle(l)} · asking ${formatNaira(l.price_ngn)}` : formatHomeTitle(l)
      }
    >
      {(l) => <OfferForm key={l.id} listing={l} onClose={onClose} onSubmit={onSubmit} />}
    </TrackerSheet>
  );
}

function OfferForm({
  listing,
  onClose,
  onSubmit,
}: {
  listing: ListingDetail;
  onClose: () => void;
  onSubmit: (action: ListingAction) => Promise<boolean>;
}) {
  const [offer, setOffer] = useState(() => toInput(listing.offer_ngn));
  const [counter, setCounter] = useState(() => toInput(listing.counter_ngn));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const offerValue = readAmount(offer);
  const counterValue = readAmount(counter);
  const offerBad = tried && offerValue === undefined;
  const counterBad = tried && counterValue === undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (busy || offerValue === undefined || counterValue === undefined) return;
    setBusy(true);
    try {
      await onSubmit({ type: "offer", offer: offerValue, counter: counterValue });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="flex gap-3">
        <AmountField id="offer-amount" label="Your offer" value={offer} onChange={setOffer} invalid={offerBad} />
        <AmountField id="counter-amount" label="Their counter" value={counter} onChange={setCounter} invalid={counterBad} />
      </div>
      {(offerBad || counterBad) && (
        <p role="alert" className="-mt-3 text-sm font-semibold text-needs-ink">
          Enter an amount like 6.8m or 850k, or leave it empty.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save offer"}
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  const parsed = readAmount(value);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="e.g. 6.8m"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        className={FIELD_CLASS}
      />
      <span id={`${id}-hint`} className="min-h-5 text-[13px] font-medium text-text-3 tabular-nums">
        {typeof parsed === "number" ? `₦${parsed.toLocaleString("en-NG")}` : ""}
      </span>
    </div>
  );
}
