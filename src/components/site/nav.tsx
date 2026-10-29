"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, LayoutDashboard, Loader2, LogOut, Menu, Moon, Play, Sun, X } from "@/components/icons";
import { Logo } from "./brand";
import { buttonClass, cn } from "@/components/ui";
import { useTheme } from "./theme";
import { useI18n } from "./locale-provider";
import { LanguageSwitcher } from "./language-switcher";
import type { MessageKey } from "@/lib/i18n";

/**
 * Two menus, one header.
 *
 * Signed out you are reading a marketing site: anchors into the pitch, then a
 * sign-in link and a studio CTA. Signed in you are inside a workspace: the
 * marketing anchors are gone and the links are the tools (studio, history,
 * plan). Keeping the two sets disjoint is what stops the landing page and the
 * dashboard from feeling like the same screen.
 */
const MARKETING_LINKS: { href: string; key: MessageKey }[] = [
  { href: "/#platform", key: "nav.platform" },
  { href: "/#signals", key: "nav.signals" },
  { href: "/#scoring", key: "nav.scoring" },
  { href: "/pricing", key: "nav.pricing" },
  { href: "/report/demo", key: "nav.sample" },
];

const APP_LINKS: { href: string; key: MessageKey }[] = [
  { href: "/studio", key: "nav.openStudio" },
  { href: "/dashboard", key: "nav.history" },
  { href: "/pricing", key: "nav.pricing" },
];

interface Account {
  name: string;
  email: string;
  plan?: string;
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
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

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
  const links = signedIn ? APP_LINKS : MARKETING_LINKS;
  const initial = account?.name?.trim().charAt(0).toUpperCase() || "?";

  return (
    <header
      className={cn(
        "no-print fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || open
          ? "border-b border-line/70 bg-base/80 backdrop-blur-xl"
          : "border-b border-transparent",
        // A violet hairline marks the workspace; the marketing site keeps a
        // neutral edge. Small signal, but it is the first thing that tells you
        // which half of the product you are in.
        signedIn && (scrolled || open) && "shadow-[inset_0_1px_0_0_rgba(124,92,255,0.18)]",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-7">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label={t("a11y.primaryNav")}>
            {links.map((link) => {
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
                  {t(link.key)}
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
         *   < 768px        language + theme + hamburger
         *   768–1023px     language + studio CTA + hamburger
         *   >= 1024px      full links + CTAs + account
         */}
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="grid size-10 place-items-center rounded-lg text-mist transition-colors hover:text-ink"
            aria-label={theme === "dark" ? t("nav.themeLight") : t("nav.themeDark")}
            title={theme === "dark" ? t("nav.themeLight") : t("nav.themeDark")}
          >
            {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
        </div>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {signedIn ? (
            <>
              <Link href="/studio" className={buttonClass("primary", "sm", "group")}>
                {t("nav.openStudio")}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <div className="ml-1 hidden items-center gap-2 border-l border-line/70 pl-2 lg:flex">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/5"
                  title={account?.email}
                >
                  <span
                    className="grid size-8 place-items-center rounded-full border border-brand/35 bg-brand/15 text-[12px] font-semibold text-brand-soft"
                    aria-hidden
                  >
                    {initial}
                  </span>
                  <span className="hidden flex-col leading-tight xl:flex">
                    <span className="max-w-[9rem] truncate text-[11.5px] font-medium text-ink">
                      {account?.name ?? t("nav.account")}
                    </span>
                    <span className="text-[9.5px] uppercase tracking-[0.14em] text-fog">
                      {account?.plan === "pro" ? t("common.pro") : t("common.free")}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="grid size-8 place-items-center rounded-lg text-fog transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-50"
                  aria-label={t("nav.signOut")}
                  title={t("nav.signOut")}
                >
                  {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                </button>
              </div>
            </>
          ) : (
            <>
              {account === null && (
                <Link href="/login" className={buttonClass("ghost", "sm", "hidden lg:inline-flex")}>
                  {t("nav.signIn")}
                </Link>
              )}
              <Link href="/studio" className={buttonClass("primary", "sm", "group")}>
                {t("nav.openStudio")}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="-mr-1.5 grid size-10 place-items-center rounded-lg border border-line text-mist transition-colors hover:text-ink lg:hidden"
          aria-label={open ? t("nav.closeMenu") : t("nav.menu")}
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
        <nav className="container-page flex flex-col py-2" aria-label={t("a11y.mobileNav")}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-lg px-2 text-[14px] text-mist transition-colors hover:bg-white/5 hover:text-ink"
            >
              {t(link.key)}
            </Link>
          ))}

          <LanguageSwitcher variant="full" />

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-[14px] text-mist transition-colors hover:bg-white/5 hover:text-ink"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === "dark" ? t("nav.themeLight") : t("nav.themeDark")}
          </button>

          <div className="mt-2 flex flex-col gap-2 pb-1">
            {signedIn ? (
              <>
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <span className="grid size-9 place-items-center rounded-full border border-brand/35 bg-brand/15 text-[12px] font-semibold text-brand-soft">
                    {initial}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{account?.name}</span>
                    <span className="block truncate text-[11px] text-fog">{account?.email}</span>
                  </span>
                </div>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className={buttonClass("subtle", "md", "w-full md:hidden")}
                >
                  {t("nav.dashboard")}
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className={buttonClass("ghost", "md", "w-full")}
                >
                  {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                  {t("nav.signOut")}
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
                    {t("nav.signIn")}
                  </Link>
                )}
                <Link
                  href="/studio"
                  onClick={() => setOpen(false)}
                  className={buttonClass("primary", "md", "w-full")}
                >
                  {t("nav.openStudio")}
                  <ArrowRight className="size-4" />
                </Link>
              </>
            )}
          </div>

          {/* Small reminder of what signed-in users get, so the drawer is not a
              dead end on a phone. */}
          {!signedIn && account === null && (
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="mb-1 mt-1 flex min-h-11 items-center gap-2 rounded-lg px-2 text-[13px] text-brand-soft"
            >
              <LayoutDashboard className="size-4" /> {t("auth.signUpButton")}
            </Link>
          )}
          {signedIn && (
            <Link
              href="/studio"
              onClick={() => setOpen(false)}
              className="mb-1 mt-1 flex min-h-11 items-center gap-2 rounded-lg px-2 text-[13px] text-brand-soft"
            >
              <Play className="size-4" /> {t("landing.cta.start")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
