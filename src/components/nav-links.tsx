"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, navLinkClass } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Nav links with the current page highlighted (needs the pathname, so it's a client component). */
export function NavLinks() {
  const pathname = usePathname();
  return NAV.map((item) => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(navLinkClass, active && "font-medium text-foreground")}
      >
        {item.label}
      </Link>
    );
  });
}
