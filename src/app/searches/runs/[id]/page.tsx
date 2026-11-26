import { Suspense } from "react";
import type { Metadata } from "next";
import { RunView } from "@/components/searches/run-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Run · Rental Hunt" };

/** One run's progress and results. Params are a Promise in Next 16, so they resolve inside Suspense. */
export default function RunPage({ params }: PageProps<"/searches/runs/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-6 mt-24 h-[160px] rounded-[24px]" />}>
      <Run params={params} />
    </Suspense>
  );
}

async function Run({ params }: { params: PageProps<"/searches/runs/[id]">["params"] }) {
  const { id } = await params;
  return <RunView id={id} />;
}
