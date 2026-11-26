import type { Metadata } from "next";
import { HiddenList } from "@/components/criteria/hidden-list";

export const metadata: Metadata = { title: "Hidden listings · Rental Hunt" };

/** See hidden: new listings kept out of the Inbox, grouped by the rule that hid each. Loads on the client. */
export default function HiddenPage() {
  return <HiddenList />;
}
