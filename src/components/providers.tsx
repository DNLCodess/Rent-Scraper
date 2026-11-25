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
      {/* Top-centre so toasts never sit behind the fixed tab bar or the selection bar. */}
      <Toaster position="top-center" />
    </>
  );
}
