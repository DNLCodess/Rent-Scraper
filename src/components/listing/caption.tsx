export interface Span {
  start: number;
  end: number;
}

export interface Segment {
  text: string;
  marked: boolean;
}

/**
 * Splits a caption into plain and highlighted runs. Spans are sorted, clamped to the text
 * and merged when they overlap, so bad offsets can never drop or repeat caption text.
 */
export function captionSegments(text: string, highlights: Span[]): Segment[] {
  const spans = highlights
    .map((h) => ({
      start: Math.max(0, Math.min(h.start, text.length)),
      end: Math.max(0, Math.min(h.end, text.length)),
    }))
    .filter((h) => h.end > h.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    const start = Math.max(s.start, pos);
    if (s.end <= start) continue;
    if (start > pos) out.push({ text: text.slice(pos, start), marked: false });
    out.push({ text: text.slice(start, s.end), marked: true });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), marked: false });
  return out;
}

interface CaptionProps {
  text: string;
  highlights: Span[];
}

/** "From the caption": the TikTok caption with the parsed phrases (price, area, beds, power, phone) marked. */
export function Caption({ text, highlights }: CaptionProps) {
  const trimmed = text.trim();
  return (
    <section aria-labelledby="caption-title" className="flex flex-col gap-3">
      <h2 id="caption-title" className="m-0 text-xs font-bold tracking-[0.06em] text-text-3 uppercase">
        From the caption
      </h2>
      {trimmed ? (
        <p className="m-0 text-[15px] leading-[1.7] break-words whitespace-pre-line text-[#2E4144] dark:text-text-2">
          {captionSegments(text, highlights).map((s, i) =>
            s.marked ? (
              <mark key={i} className="rounded-[4px] bg-brass-highlight px-[3px] py-px text-text">
                {s.text}
              </mark>
            ) : (
              s.text
            ),
          )}
        </p>
      ) : (
        <p className="m-0 text-[15px] leading-[1.6] font-medium text-text-2">This video has no caption.</p>
      )}
    </section>
  );
}
