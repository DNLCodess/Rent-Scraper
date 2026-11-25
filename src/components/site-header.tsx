import { Suspense } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { NAV, navLinkClass } from "@/lib/nav";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-md text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          TikTok Rentals
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {/* Plain links render instantly; the active-state version streams in. */}
          <Suspense
            fallback={NAV.map((item) => (
              <Link key={item.href} href={item.href} className={navLinkClass}>
                {item.label}
              </Link>
            ))}
          >
            <NavLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
