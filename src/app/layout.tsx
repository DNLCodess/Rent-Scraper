import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { TabBar, TabBarFallback } from "@/components/app/tab-bar";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rental Hunt",
  description: "Find a home to rent from TikTok listings: one inbox, one tracker, your criteria.",
};

export const viewport: Viewport = {
  themeColor: "#0F4F55",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>
          <main>{children}</main>
          {/* usePathname needs a Suspense boundary; the fallback renders the bar without an active tab. */}
          <Suspense fallback={<TabBarFallback />}>
            <TabBar />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
