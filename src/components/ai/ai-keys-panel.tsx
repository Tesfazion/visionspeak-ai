"use client";

import { useEffect, useState } from "react";
import { Card, Field, Input, Label, cn } from "@/components/ui";
import type { AiProvider, ExternalAiKeySummary } from "@/lib/external-ai-keys/types";

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  openrouter: "openrouter/auto",
  anthropic: "claude-3-haiku-20240307",
};

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "anthropic", label: "Anthropic" },
];

export function AiKeysPanel() {
  const [keys, setKeys] = useState<ExternalAiKeySummary[]>([]);
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [label, setLabel] = useState("");
  const [rawKey, setRawKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/keys", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load AI keys.");
        if (active) setKeys(data as ExternalAiKeySummary[]);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load AI keys.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const changeProvider = (nextProvider: AiProvider) => {
    setProvider(nextProvider);
    setModel(DEFAULT_MODELS[nextProvider]);
  };

  const addKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const response = await fetch("/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, rawKey, label, model }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this key.");
      setKeys((current) => [result.record as ExternalAiKeySummary, ...current]);
      setRawKey("");
      setLabel("");
      setNotice("Provider key saved. The secret is encrypted and will not be shown again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this key.");
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async (key: ExternalAiKeySummary) => {
    if (!window.confirm(`Remove ${key.label}?`)) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/ai/keys/${encodeURIComponent(key.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not remove this key.");
      }
      setKeys((current) => current.filter((entry) => entry.id !== key.id));
      setNotice("Provider key removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this key.");
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="eyebrow">Bring your own key</div>
      <h2 className="mt-2 text-[18px] font-semibold text-ink">AI provider keys</h2>
      <p className="pretty mt-2 text-[13px] leading-relaxed text-fog">
        Connect your OpenAI, OpenRouter, or Anthropic account. Provider usage and billing are handled by that provider.
        Your key is encrypted before it is stored and is never returned to the browser.
      </p>

      <form onSubmit={addKey} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field>
          <Label htmlFor="ai-provider">Provider</Label>
          <select
            id="ai-provider"
            value={provider}
            onChange={(event) => changeProvider(event.target.value as AiProvider)}
            className="h-11 w-full rounded-xl border border-line bg-base px-3 text-[14px] text-ink outline-none focus:border-brand"
          >
            {PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field>
          <Label htmlFor="ai-key-label">Label</Label>
          <Input id="ai-key-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="My work key" />
        </Field>
        <Field>
          <Label htmlFor="ai-model">Model</Label>
          <Input id="ai-model" value={model} onChange={(event) => setModel(event.target.value)} maxLength={120} required />
        </Field>
        <Field>
          <Label htmlFor="ai-provider-key">Provider API key</Label>
          <Input
            id="ai-provider-key"
            type="password"
            autoComplete="new-password"
            value={rawKey}
            onChange={(event) => setRawKey(event.target.value)}
            maxLength={2048}
            required
          />
        </Field>
        {error && <p role="alert" className="text-[13px] text-rose sm:col-span-2">{error}</p>}
        {notice && <p role="status" className="text-[13px] text-mint sm:col-span-2">{notice}</p>}
        <button
          type="submit"
          disabled={saving}
          className={cn("min-h-11 rounded-xl bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand/90 disabled:opacity-50 sm:col-span-2 sm:justify-self-start")}
        >
          {saving ? "Saving…" : "Save provider key"}
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-[14px] font-medium text-ink">Connected providers</h3>
        {loading ? (
          <p className="mt-3 text-[13px] text-fog">Loading connected keys…</p>
        ) : keys.length === 0 ? (
          <p className="mt-3 text-[13px] text-fog">No provider keys yet. Add one above to enable AI chat and session feedback.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-ink">{key.label}</p>
                  <p className="mt-1 text-[12px] text-fog">
                    {key.provider} · {key.model} · {key.useCount} successful uses · {key.prefix}…
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeKey(key)}
                  className="min-h-11 rounded-lg border border-rose/30 px-3 text-[13px] text-rose hover:bg-rose/10"
                  aria-label={`Remove ${key.label}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
