import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, STATUS_LABEL, statusVariant } from "@/lib/format";
import { listRuns } from "@/lib/runs";

export default function HistoryPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <Suspense fallback={<HistorySkeleton />}>
        <RunList />
      </Suspense>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

async function RunList() {
  await connection(); // always render with fresh data
  const runs = await listRuns();

  return runs.length === 0 ? (
    <div className="space-y-3 rounded-lg border px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        No runs yet. Start a search to see it here.
      </p>
      <Button nativeButton={false} render={<Link href="/" />}>
        New search
      </Button>
    </div>
  ) : (
    <ul className="divide-y rounded-lg border">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/runs/${run.id}`}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="truncate font-medium">{run.tags.join(", ")}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(run.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {run.status === "done" && (
                <span className="text-muted-foreground tabular-nums">
                  {run.result_count}{" "}
                  {run.result_count === 1 ? "result" : "results"}
                </span>
              )}
              <Badge variant={statusVariant(run.status)}>
                {STATUS_LABEL[run.status]}
              </Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
