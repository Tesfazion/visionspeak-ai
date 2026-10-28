"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, LogOut, Menu, X } from "@/components/icons";
import { Logo } from "./brand";
import { buttonClass, cn } from "@/components/ui";

const LINKS = [
  { href: "/#platform", label: "Platform" },
  { href: "/#signals", label: "Signals" },
  { href: "/#scoring", label: "Scoring" },
  { href: "/report/demo", label: "Sample report" },
  { href: "/dashboard", label: "History" },
];

interface Account {
  name: string;
  email: string;
}

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // `undefined` = still resolving, `null` = signed out. Kept client-side so the
  // marketing pages stay statically rendered instead of reading cookies.
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The drawer closes from its own link handlers (see onClick below) rather
  // than from a pathname effect — an effect that only mirrors an event is a
  // cascading render for no benefit.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((body: { user: Account | null }) => {
        if (!cancelled) setAccount(body.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // While the drawer is open the page behind it must not scroll, and Escape
  // must close it — both are standard for a full-width mobile menu.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAccount(null);
      setOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  const signedIn = Boolean(account);
  const initial = account?.name?.trim().charAt(0).toUpperCase() || "?";

  return (
    <header
      className={cn(
        "no-print fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || open
          ? "border-b border-line/70 bg-base/80 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-7">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {LINKS.map((link) => {
              const active = link.href.startsWith("/") && !link.href.includes("#") && pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    active ? "text-ink" : "text-fog hover:text-ink",
                  )}
                >
                  {link.label}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-brand-soft to-transparent" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/*
         * One control set per width:
         *   < 768px        hamburger only
         *   768–1023px     studio CTA + hamburger
         *   >= 1024px      full links + CTAs + account
         */}
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {signedIn ? (
            <>
              <Link href="/dashboard" className={buttonClass("ghost", "sm", "hidden lg:inline-flex")}>
                Dashboard
              </Link>
              <Link href="/studio" className={buttonClass("primary", "sm", "group")}>
                Open studio
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <div className="ml-1 hidden items-center gap-2 border-l border-line/70 pl-2 lg:flex">
                <span
                  className="grid size-8 place-items-center rounded-full border border-brand/35 bg-brand/15 text-[12px] font-semibold text-brand-soft"
                  title={account?.email}
                  aria-hidden
                >
                  {initial}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="grid size-8 place-items-center rounded-lg text-fog transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-50"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                </button>
              </div>
            </>
          ) : (
            <>
              {account === null && (
                <Link href="/login" className={buttonClass("ghost", "sm", "hidden lg:inline-flex")}>
                  Sign in
                </Link>
              )}
              <Link href="/studio" className={buttonClass("primary", "sm", "group")}>
                Open studio
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="-mr-1.5 grid size-10 place-items-center rounded-lg border border-line text-mist transition-colors hover:text-ink lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          {open ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
        </button>
      </div>

      <div
        id="mobile-nav"
        hidden={!open}
        className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain-y border-t border-line bg-base/95 backdrop-blur-xl lg:hidden"
      >
        <nav className="container-page flex flex-col py-2" aria-label="Mobile">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-lg px-2 text-[14px] text-mist transition-colors hover:bg-white/5 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 pb-1">
            {signedIn ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className={buttonClass("subtle", "md", "w-full md:hidden")}
                >
                  Dashboard
                </Link>
                <Link
                  href="/studio"
                  onClick={() => setOpen(false)}
                  className={buttonClass("primary", "md", "w-full")}
                >
                  Open studio
                  <ArrowRight className="size-4" />
                </Link>
                <button type="button" onClick={signOut} disabled={signingOut} className={buttonClass("ghost", "md", "w-full")}>
                  {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                  Sign out
                </button>
              </>
            ) : (
              <>
                {account === null && (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className={buttonClass("subtle", "md", "w-full")}
                  >
                    Sign in
                  </Link>
                )}
                <Link
                  href="/studio"
                  onClick={() => setOpen(false)}
                  className={buttonClass("primary", "md", "w-full")}
                >
                  Open studio
                  <ArrowRight className="size-4" />
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
