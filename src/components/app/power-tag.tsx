import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PowerLevel } from "@/lib/parser";

interface PowerTagProps {
  level: PowerLevel;
  /** Text shown in the tag, e.g. "24/7 · Band A". */
  label: string;
  /** "md" (reel, detail: 28px) or "sm" (grid tiles: 22px). */
  size?: "sm" | "md";
  className?: string;
}

/** Brass power tag with the lightbulb icon (never a zap). Renders nothing for unknown power. */
export function PowerTag({ level, label, size = "md", className }: PowerTagProps) {
  if (level === "unknown") return null;
  const sm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-brass font-bold whitespace-nowrap text-brass-ink",
        sm ? "h-[22px] gap-1 pr-2 pl-1.5 text-[11px]" : "h-7 gap-1.5 pr-3 pl-2.5 text-[13px]",
        className,
      )}
    >
      <Lightbulb aria-hidden strokeWidth={1.8} className={sm ? "size-[13px]" : "size-4"} />
      {label}
    </span>
  );
}
