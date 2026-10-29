"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Loader2, Lock, Mail, UserRound } from "@/components/icons";
import { useI18n } from "@/components/site/locale-provider";
import { Button } from "@/components/ui";
import { POST_AUTH_PATH } from "@/lib/routes";

type Mode = "login" | "signup";

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signup = mode === "signup";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${signup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signup ? { name, email, password } : { email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // Server messages are English-only today; a translated fallback is
        // better than leaking a raw JSON string into the form.
        throw new Error(body.error ?? t("auth.errorGeneric"));
      }
      // A full document navigation, deliberately — not router.replace().
      // The session cookie is set on *this* POST response, and a client-side
      // transition can be served from the Router Cache that was filled while
      // signed out (the nav prefetches /studio and /dashboard), which replays
      // the "not signed in" redirect. The user then sees the login page again
      // and concludes the password failed. A document load always sends the
      // new cookie and renders the destination fresh.
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.errorGeneric"));
      setBusy(false);
    }
  };

  const field =
    "h-11 w-full rounded-xl border border-line bg-white/[0.02] pl-10 pr-3 text-[13.5px] text-ink placeholder:text-fog/60 focus:border-brand/50 focus:outline-none";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {signup && (
        <label className="relative block">
          <span className="sr-only">{t("auth.name")}</span>
          <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog/60" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
            placeholder={t("auth.namePlaceholder")}
            autoComplete="name"
            maxLength={60}
          />
        </label>
      )}

      <label className="relative block">
        <span className="sr-only">{t("auth.email")}</span>
        <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog/60" />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          placeholder={t("auth.emailPlaceholder")}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          required
        />
      </label>

      <label className="relative block">
        <span className="sr-only">{t("auth.password")}</span>
        <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog/60" />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
          placeholder={signup ? t("auth.passwordPlaceholder") : t("auth.passwordCurrent")}
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>

      {error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-rose/25 bg-rose/[0.07] px-3 py-2 text-[12px] text-rose"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="md" disabled={busy} className="mt-1 w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? t("auth.working") : signup ? t("auth.signUpButton") : t("auth.signInButton")}
        {!busy && <ArrowRight className="size-3.5" />}
      </Button>

      <p className="mt-1 text-center text-[12px] text-fog">
        {signup ? `${t("auth.haveAccount")} ` : `${t("auth.noAccount")} `}
        <Link
          href={`${signup ? "/login" : "/signup"}${next !== POST_AUTH_PATH ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand-soft transition-colors hover:text-brand"
        >
          {signup ? t("auth.signInLink") : t("auth.signUpLink")}
        </Link>
      </p>
    </form>
  );
}
