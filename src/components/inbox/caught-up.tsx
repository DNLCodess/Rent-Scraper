import Link from "next/link";
import { Check, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { nextSearchLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

interface CaughtUpProps {
  /** huntState === "done": the owner found a home and daily searches are paused. */
  huntDone: boolean;
}

/** Empty Inbox: a calm message, when the next daily search runs, and a way to Searches. */
export function CaughtUp({ huntDone }: CaughtUpProps) {
  return (
    <section
      aria-labelledby="caught-up-title"
      className="mx-6 flex flex-col items-center gap-6 rounded-3xl border border-line bg-surface px-6 py-12 text-center"
    >
      <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-primary-tint text-primary">
        <Check className="size-7" strokeWidth={1.8} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 id="caught-up-title" className="m-0 text-xl font-bold tracking-[-0.01em] text-text">
          {huntDone ? "Hunt finished" : "You're all caught up"}
        </h2>
        <p className="m-0 text-[15px] leading-[1.6] font-medium text-text-2">
          {huntDone
            ? "Daily searches are paused while the hunt is finished."
            : "New listings from your saved searches land here."}
        </p>
        {!huntDone && <p className="m-0 text-sm font-bold text-primary tabular-nums">{nextSearchLabel()}</p>}
      </div>
      <Link href="/searches" className={cn(buttonVariants({ variant: "outline" }))}>
        <Search aria-hidden />
        Go to Searches
      </Link>
    </section>
  );
}
