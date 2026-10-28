"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, Lock, Mail, UserRound } from "@/components/icons";
import { Button } from "@/components/ui";

type Mode = "login" | "signup";

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
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
        throw new Error(body.error ?? "Something went wrong. Try again.");
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  const field =
    "h-11 w-full rounded-xl border border-line bg-white/[0.02] pl-10 pr-3 text-[13.5px] text-ink placeholder:text-fog/60 focus:border-brand/50 focus:outline-none";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {signup && (
        <label className="relative block">
          <span className="sr-only">Name</span>
          <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog/60" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
            placeholder="Your name"
            autoComplete="name"
            maxLength={60}
          />
        </label>
      )}

      <label className="relative block">
        <span className="sr-only">Email</span>
        <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog/60" />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          required
        />
      </label>

      <label className="relative block">
        <span className="sr-only">Password</span>
        <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog/60" />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
          placeholder={signup ? "At least 8 characters" : "Your password"}
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-rose/25 bg-rose/[0.07] px-3 py-2 text-[12px] text-rose">
          {error}
        </p>
      )}

      <Button type="submit" size="md" disabled={busy} className="mt-1 w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {signup ? "Create account" : "Sign in"}
        {!busy && <ArrowRight className="size-3.5" />}
      </Button>

      <p className="mt-1 text-center text-[12px] text-fog">
        {signup ? "Already have an account? " : "New to VisionSpeak? "}
        <Link
          href={`${signup ? "/login" : "/signup"}${next !== "/studio" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand-soft transition-colors hover:text-brand"
        >
          {signup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </form>
  );
}
