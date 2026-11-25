import { SearchForm } from "@/components/search-form";

export default function SearchPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Find rentals on TikTok</h1>
        <p className="text-muted-foreground">
          Collect house-for-rent videos by hashtag or keyword. Price, area, bedrooms and contact are pulled from
          captions and creator bios.
        </p>
      </div>
      <SearchForm />
    </div>
  );
}
