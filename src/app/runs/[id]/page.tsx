import { Suspense } from "react";
import { RunView } from "@/components/run-view";
import { Skeleton } from "@/components/ui/skeleton";

export default function RunPage({ params }: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-64" />}>
      <Run params={params} />
    </Suspense>
  );
}

async function Run({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const { id } = await params;
  return <RunView id={id} />;
}
