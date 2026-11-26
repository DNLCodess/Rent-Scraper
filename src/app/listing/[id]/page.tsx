import { Suspense } from "react";
import { ListingDetail, ListingDetailSkeleton } from "@/components/listing/listing-detail";

/** Listing detail. Params are a Promise in Next 16, so they resolve inside Suspense. */
export default function ListingPage({ params }: PageProps<"/listing/[id]">) {
  return (
    <Suspense fallback={<ListingDetailSkeleton />}>
      <Listing params={params} />
    </Suspense>
  );
}

async function Listing({ params }: { params: PageProps<"/listing/[id]">["params"] }) {
  const { id } = await params;
  return <ListingDetail id={id} />;
}
