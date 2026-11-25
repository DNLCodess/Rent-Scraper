"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/tag-input";
import { api, ApiError } from "@/lib/api/client";
import { COUNT_OPTIONS, MAX_TAGS, type Run, type SettingsView } from "@/lib/types";

export function SearchForm() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [count, setCount] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SettingsView>("/api/settings")
      .then((s) => {
        setSettings(s);
        setTags(s.defaultTags);
        setCount(String(s.defaultCount));
      })
      .catch((e: ApiError) => setError(e.message));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tags.length) return setError("Add at least one hashtag or keyword.");
    setSubmitting(true);
    setError(null);
    try {
      const { run_id } = await api<{ run_id: string; run: Run }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ tags, count: Number(count) }),
      });
      router.push(`/runs/${run_id}`);
    } catch (e) {
      setError((e as ApiError).message);
      setSubmitting(false);
    }
  }

  if (!settings && !error) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-40" />
      </div>
    );
  }

  const countOptions = COUNT_OPTIONS.includes(Number(count)) ? COUNT_OPTIONS : [...COUNT_OPTIONS, Number(count)].sort((a, b) => a - b);
  const items = countOptions.map((n) => ({ value: String(n), label: `${n} videos per tag` }));
  const needsToken = settings?.provider === "apify" && !settings.tokenSet;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {needsToken && (
        <p role="status" className="rounded-lg border px-4 py-3 text-sm">
          No Apify API token is set yet.{" "}
          <Link href="/settings" className="font-medium text-primary underline-offset-4 hover:underline">
            Add one in Settings
          </Link>{" "}
          before running a search.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="tags">Hashtags or keywords</Label>
        <TagInput
          id="tags"
          value={tags}
          onChange={setTags}
          max={MAX_TAGS}
          placeholder="lagosapartments, 2 bedroom yaba"
          describedBy="tags-help"
        />
        <p id="tags-help" className="text-sm text-muted-foreground">
          Press Enter after each one. Single words are searched as hashtags; phrases with spaces as keywords. Up to{" "}
          {MAX_TAGS}.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="count">Videos</Label>
          <Select items={items} value={count} onValueChange={(v) => v && setCount(v)}>
            <SelectTrigger id="count" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="px-4" disabled={submitting || !tags.length}>
          {submitting ? "Starting…" : "Run"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
