import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CriteriaCardProps {
  id: string;
  title: string;
  /** One line on what the rule does to the Inbox. */
  effect?: string;
  /** Leading badge beside the title, e.g. the power lightbulb. */
  icon?: ReactNode;
  /** Server message from the last failed save, shown under the card. */
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** A criteria card: title 17/700, one-line effect 13/500, then the control. */
export function CriteriaCard({ id, title, effect, icon, error, className, children }: CriteriaCardProps) {
  const heading = (
    <div className="flex flex-col gap-1">
      <h2 id={`${id}-h`} className="m-0 text-[17px] font-bold text-text">
        {title}
      </h2>
      {effect && <p className="m-0 text-[13px] leading-[1.5] font-medium text-text-3">{effect}</p>}
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <section
        aria-labelledby={`${id}-h`}
        className={cn("flex flex-col gap-5 rounded-[24px] border border-line bg-surface px-5 py-6", className)}
      >
        {icon ? (
          <div className="flex items-start gap-3">
            {icon}
            {heading}
          </div>
        ) : (
          heading
        )}
        {children}
      </section>
      {error && (
        <p role="alert" className="m-0 px-1 text-[13px] leading-[1.5] font-semibold text-needs-ink">
          {error}
        </p>
      )}
    </div>
  );
}
