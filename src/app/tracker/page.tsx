import type { Metadata } from "next";
import { TrackerView } from "@/components/tracker/tracker-view";

export const metadata: Metadata = { title: "Tracker · Rental Hunt" };

/** Tracker: listings in progress by stage. Data loads on the client, with skeletons while it does. */
export default function TrackerPage() {
  return <TrackerView />;
}
