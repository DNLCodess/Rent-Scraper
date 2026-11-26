"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Kanban, Search, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InboxResponse } from "@/lib/types";

export type TabId = "inbox" | "tracker" | "searches" | "criteria";

const TABS: { id: TabId; href: string; label: string; icon: LucideIcon }[] = [
  { id: "inbox", href: "/", label: "Inbox", icon: Inbox },
  { id: "tracker", href: "/tracker", label: "Tracker", icon: Kanban },
  { id: "searches", href: "/searches", label: "Searches", icon: Search },
  { id: "criteria", href: "/criteria", label: "My criteria", icon: UserRound },
];

/** Which tab a path belongs to; undefined for pages outside the four tabs. */
export function tabForPath(pathname: string): TabId | undefined {
  if (pathname === "/" || pathname.startsWith("/listing/")) return "inbox";
  if (pathname === "/tracker" || pathname.startsWith("/tracker/")) return "tracker";
  if (pathname.startsWith("/searches")) return "searches";
  if (pathname.startsWith("/criteria")) return "criteria";
  return undefined;
}

interface TabBarProps {
  /** Overrides the tab derived from the pathname. */
  active?: TabId;
  /** Overrides the Inbox badge count fetched from GET /api/inbox. */
  newCount?: number;
}

/**
 * Bottom tab bar: Inbox (badge = new matches) · Tracker · Searches · My criteria.
 * Uses usePathname, so render it inside <Suspense> (see TabBarFallback).
 */
export function TabBar({ active, newCount }: TabBarProps) {
  const pathname = usePathname();
  const current = active ?? tabForPath(pathname);
  const fetched = useInboxCount(pathname, newCount === undefined);
  const count = newCount ?? fetched;
  return <TabBarView active={current} count={count} />;
}

/** Static tab bar shown while the pathname-aware one streams in. */
export function TabBarFallback() {
  return <TabBarView active={undefined} count={0} />;
}

const INBOX_CHANGED = "inbox:changed";

/** Tells the tab bar to refresh its Inbox badge after listings were dismissed, shortlisted or restored. */
export function notifyInboxChanged() {
  window.dispatchEvent(new Event(INBOX_CHANGED));
}

/** Fetches matchCount from GET /api/inbox (0 while the hunt is done), refreshing on route change and on notifyInboxChanged(). */
function useInboxCount(pathname: string, enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let ctrl = new AbortController();
    const refresh = () => {
      ctrl.abort();
      ctrl = new AbortController();
      const get = <T,>(path: string) =>
        fetch(path, { signal: ctrl.signal, cache: "no-store" }).then((res) => (res.ok ? (res.json() as Promise<T>) : null));
      Promise.all([get<InboxResponse>("/api/inbox"), get<{ huntState?: string }>("/api/preferences")])
        .then(([data, prefs]) => {
          // The badge is hidden while the hunt is finished (spec §7 Got it).
          if (prefs?.huntState === "done") setCount(0);
          else if (data && typeof data.matchCount === "number") setCount(data.matchCount);
        })
        .catch(() => {
          // Badge is a hint only; keep the last known count on failure.
        });
    };
    refresh();
    window.addEventListener(INBOX_CHANGED, refresh);
    return () => {
      window.removeEventListener(INBOX_CHANGED, refresh);
      ctrl.abort();
    };
  }, [pathname, enabled]);
  return count;
}

function TabBarView({ active, count }: { active: TabId | undefined; count: number }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
      style={{ paddingBottom: "calc(32px + env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex max-w-[480px] justify-around px-2 pt-3">
        {TABS.map(({ id, href, label, icon: Icon }) => {
          const isActive = id === active;
          const badge = id === "inbox" && count > 0 ? count : 0;
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                aria-label={badge ? `${label}, ${badge} new` : undefined}
                className={cn(
                  "relative flex min-h-12 min-w-[72px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] no-underline",
                  isActive ? "font-bold text-primary" : "font-semibold text-text-3 hover:text-text",
                )}
              >
                <Icon aria-hidden className="size-[22px]" strokeWidth={1.8} />
                {label}
                {badge > 0 && (
                  <span
                    aria-hidden
                    className="absolute top-0 right-3 flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-primary px-1 text-[11px] font-extrabold text-white tabular-nums"
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
