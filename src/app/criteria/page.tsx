import type { Metadata } from "next";
import { CriteriaForm } from "@/components/criteria/criteria-form";

export const metadata: Metadata = { title: "My criteria · Rental Hunt" };

/** My criteria: the rules that decide what reaches the Inbox. Data loads on the client, with skeletons while it does. */
export default function CriteriaPage() {
  return <CriteriaForm />;
}
