import type { ReactNode } from "react";

interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing control, e.g. the Inbox view toggle; bottom-aligned with the title block. */
  right?: ReactNode;
}

/** Page header: 24px gutter, content 24px below the safe area, title 28/800. */
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <header
      className="flex items-end justify-between gap-4"
      style={{ padding: "calc(24px + env(safe-area-inset-top)) 24px 24px" }}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="m-0 text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] text-text">{title}</h1>
        {subtitle != null && (
          <p className="m-0 text-sm leading-[1.4] font-medium text-text-2">{subtitle}</p>
        )}
      </div>
      {right != null && <div className="shrink-0">{right}</div>}
    </header>
  );
}
