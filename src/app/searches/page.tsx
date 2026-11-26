import type { Metadata } from "next";
import { SearchesView } from "@/components/searches/searches-view";

export const metadata: Metadata = { title: "Searches · Rental Hunt" };

/** Searches: saved searches, recent runs and the Apify token. Data loads on the client, with skeletons while it does. */
export default function SearchesPage() {
  return <SearchesView />;
}
