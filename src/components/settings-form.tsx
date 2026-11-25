"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/tag-input";
import { api, ApiError } from "@/lib/api/client";
import { COUNT_OPTIONS, MAX_TAGS, type SettingsView } from "@/lib/types";

export function SettingsForm() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [count, setCount] = useState("30");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(s: SettingsView) {
    setSettings(s);
    setCount(String(s.defaultCount));
    setTags(s.defaultTags);
  }

  function load() {
    api<SettingsView>("/api/settings")
      .then(apply)
      .catch((e: ApiError) => setLoadError(e.message));
  }
  useEffect(load, []);

  function reload() {
    setLoadError(null);
    load();
  }

  async function save(body: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);
    try {
      apply(await api<SettingsView>("/api/settings", { method: "PUT", body: JSON.stringify(body) }));
      setToken("");
      toast.success(message);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 px-4 py-3">
        <p className="text-sm">{loadError}</p>
        <Button variant="outline" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const items = COUNT_OPTIONS.map((n) => ({ value: String(n), label: `${n} videos per tag` }));

  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="token-heading">
        <div className="space-y-1">
          <h2 id="token-heading" className="font-medium">
            Apify API token
          </h2>
          <p className="text-sm text-muted-foreground">
            Used to run the TikTok scraper. Find it in Apify Console under Settings → API &amp; Integrations. It is
            stored on the server and never sent back to the browser.
          </p>
        </div>
        {settings.provider === "mock" && (
          <p className="rounded-lg border px-4 py-3 text-sm">
            Demo mode is on (SCRAPER_PROVIDER=mock), so runs return sample data and the token is not used.
          </p>
        )}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) save({ apifyToken: token }, "Token saved");
          }}
        >
          <Label htmlFor="token">Token</Label>
          <div className="flex gap-2">
            <Input
              id="token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={settings.tokenSet ? `Current token ${settings.tokenPreview}` : "apify_api_…"}
              aria-describedby="token-status"
            />
            <Button type="submit" disabled={saving || !token.trim()}>
              Save
            </Button>
          </div>
          <p id="token-status" className="text-sm text-muted-foreground">
            {settings.tokenSet
              ? `A token is set (${settings.tokenPreview}, from ${settings.tokenSource === "env" ? "the APIFY_TOKEN environment variable" : "these settings"}).`
              : "No token is set."}{" "}
            {settings.tokenSource === "settings" && (
              <Button
                variant="link"
                className="h-auto p-0"
                type="button"
                disabled={saving}
                onClick={() => save({ clearToken: true }, "Saved token removed")}
              >
                Remove saved token
              </Button>
            )}
          </p>
        </form>
      </section>

      <section className="space-y-4" aria-labelledby="defaults-heading">
        <h2 id="defaults-heading" className="font-medium">
          Search defaults
        </h2>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            save({ defaultCount: Number(count), defaultTags: tags }, "Defaults saved");
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="default-tags">Default tags</Label>
            <TagInput id="default-tags" value={tags} onChange={setTags} max={MAX_TAGS} placeholder="lagosapartments" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-count">Default videos per tag</Label>
            <Select items={items} value={count} onValueChange={(v) => v && setCount(v)}>
              <SelectTrigger id="default-count" className="w-48">
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
          <Button type="submit" disabled={saving}>
            Save defaults
          </Button>
        </form>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
