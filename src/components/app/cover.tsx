"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoverProps {
  listingId: string;
  className?: string;
  /** Alt text; covers are decorative by default because the card carries the listing's label. */
  alt?: string;
}

/** Listing cover from /api/cover/{id} on the dark cover ground; shows a play placeholder if it fails. */
export function Cover({ listingId, className, alt = "" }: CoverProps) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === listingId;
  const imgRef = useRef<HTMLImageElement>(null);
  // An error that fires before hydration never reaches onError; catch it after mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailedId(listingId);
  }, [listingId]);
  return (
    <div
      className={cn("relative overflow-hidden bg-(--cover)", className)}
      style={{
        backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 14px)",
      }}
    >
      {failed ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-[rgba(14,34,38,0.55)]">
            <Play className="ml-[3px] size-6 fill-white stroke-none" />
          </span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- redirects to third-party CDNs; next/image adds nothing here
        <img
          ref={imgRef}
          src={`/api/cover/${encodeURIComponent(listingId)}`}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedId(listingId)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );
}
