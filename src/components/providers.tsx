"use client";

import { Toaster } from "@/components/ui/sonner";

/**
 * App-wide client providers. Dark mode needs none: it follows the system
 * preference through a prefers-color-scheme media query in globals.css.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" />
    </>
  );
}
