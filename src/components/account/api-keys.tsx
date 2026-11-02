"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, Field, Input, Label, cn } from "@/components/ui";
import { useI18n } from "@/components/site/locale-provider";

type ApiKeySummary = {
  id: string;
  prefix: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
};

export function ApiKeysPanel({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string>("sessions:read,reports:read");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchKeys = async () => {
    try {
      const response = await fetch("/api/api-keys");
      if (response.ok) {
        const data = await response.json();
        setKeys(data);
      } else {
        setError("Failed to load API keys");
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  // Fetch keys on mount - use a ref to avoid dependency on userId cascading
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      fetchKeys();
    }
  }, []);

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);

    try {
      const scopeArray = scopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: scopeArray }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to create API key");
      }

      const result = await response.json();
      setKeys([result.record, ...keys]);
      setName("");
      setScopes("sessions:read,reports:read");

      setSuccess(
        `API key created: ${result.key}\n\nSave it securely — you won't see it again!\n\nThe key starts with: ${result.key.substring(0, 8)}...\n\nCopy this key now - it will never be shown again.`
      );

      setTimeout(() => setSuccess(null), 15000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key?")) return;

    try {
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete API key");
      }

      setKeys(keys.filter((k) => k.id !== keyId));
      setSuccess("API key deleted");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete API key");
    } finally {
      setTimeout(() => setError(null), 5000);
    }
  };

  const setExpiry = async (keyId: string, expiresAt: string) => {
    try {
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt }),
      });

      if (!response.ok) {
        throw new Error("Failed to set expiry");
      }

      setKeys(
        keys.map((k) =>
          k.id === keyId ? { ...k, expiresAt } : k
        )
      );
      setSuccess("Expiry updated");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to set expiry");
    } finally {
      setTimeout(() => setError(null), 5000);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  const getScopeLabel = (scope: string) => {
    const labels: Record<string, string> = {
      "sessions:read": "Read sessions",
      "sessions:write": "Write sessions",
      "sessions:delete": "Delete sessions",
      "reports:read": "Read reports",
      "reports:write": "Write reports",
      "reports:share": "Share reports",
      "reports:email": "Email reports",
      "meetings:read": "Read meetings",
      "meetings:write": "Write meetings",
      "analysis:read": "Read analysis",
    };
    return labels[scope] || scope;
  };

  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-3xl">
        <div className="eyebrow">{t("apiKeys.eyebrow")}</div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {t("apiKeys.title")}
        </h1>

        <Card className="mt-6 p-6">
          <h2 className="text-[13px] font-medium text-ink">{t("apiKeys.create")}</h2>
          <form onSubmit={createKey} className="mt-4 space-y-4">
            <Field>
              <Label htmlFor="name">{t("apiKeys.nameLabel")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My integration"
                required
              />
            </Field>

            <Field>
              <Label htmlFor="scopes">{t("apiKeys.scopesLabel")}</Label>
              <Input
                id="scopes"
                value={scopes}
                onChange={(e) => setScopes(e.target.value)}
                placeholder="sessions:read,reports:read"
                required
              />
              <p className="mt-1 text-[11px] text-fog">
                Comma-separated list of scopes (e.g., sessions:read,reports:read).
              </p>
            </Field>

            {error && <p className="text-[12px] text-rose">{error}</p>}
            {success && (
              <div className="mt-4 p-4 bg-mint/10 border border-mint/30 rounded-lg">
                <p className="text-[12px] text-mint whitespace-pre-wrap">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className={cn(
                "inline-flex items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                "h-10 px-4 text-[13px] rounded-xl gap-2",
                "bg-brand text-brand-foreground hover:bg-brand/90",
              )}
            >
              {creating ? t("apiKeys.creating") : t("apiKeys.createButton")}
            </button>
          </form>
        </Card>

        <div className="mt-8">
          <h2 className="text-[13px] font-medium text-ink">{t("apiKeys.list")}</h2>

          {loading ? (
            <div className="mt-4 text-center text-[12px] text-fog">
              {t("apiKeys.loading")}
            </div>
          ) : keys.length === 0 ? (
            <Card className="mt-4 p-6 text-center">
              <p className="text-[12px] text-fog">{t("apiKeys.empty")}</p>
            </Card>
          ) : (
            <div className="mt-4 space-y-4">
              {keys.map((key) => (
                <Card key={key.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] bg-surface-2 px-2 py-0.5 rounded">
                          {key.prefix}...
                        </code>
                        <span className="text-[11px] font-medium text-ink">
                          {key.name}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11px] text-fog">
                        <p>
                          {t("apiKeys.created")}: {formatDate(key.createdAt)}
                        </p>
                        {key.expiresAt && (
                          <p>
                            {t("apiKeys.expires")}: {formatDate(key.expiresAt)}
                          </p>
                        )}
                        <p>
                          {t("apiKeys.uses")}: {key.useCount} {t("apiKeys.useCount")}
                        </p>
                        <p className="mt-1">
                          Scopes: {key.scopes.map(getScopeLabel).join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        onClick={() => deleteKey(key.id)}
                        className="text-[11px] text-rose hover:text-rose/80"
                      >
                        {t("apiKeys.delete")}
                      </button>
                      <button
                        onClick={() => {
                          const future = new Date();
                          future.setDate(future.getDate() + 30);
                          setExpiry(key.id, future.toISOString());
                        }}
                        className="text-[11px] text-brand-soft hover:text-brand"
                      >
                        {t("apiKeys.extend")}
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-[11.5px] text-fog">
          <Link href="/account" className="text-brand-soft hover:text-brand">
            {t("apiKeys.back")}
          </Link>
        </p>
      </div>
    </div>
  );
}