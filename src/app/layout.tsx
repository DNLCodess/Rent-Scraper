import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TikTok Rentals",
  description: "Collect house-for-rent posts from TikTok into a searchable, exportable list.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
          <footer className="border-t">
            <p className="mx-auto max-w-[1100px] px-4 py-4 text-xs text-muted-foreground sm:px-6">
              Scraping may breach TikTok&apos;s Terms of Service. Only public data is collected, and you are
              responsible for how you use this tool and the data it returns.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
