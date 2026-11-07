"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Field, Input, Label, cn } from "@/components/ui";
import { useI18n } from "@/components/site/locale-provider";

export function AccountSettingsForm({
  email,
  name,
  children,
}: {
  email: string;
  name: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();

  /* ------------------------------------------------------------- profile */
  const [profileName, setProfileName] = useState(name);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileDone, setProfileDone] = useState(false);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError(null);
    setProfileDone(false);
    const trimmed = profileName.trim();
    if (!trimmed) {
      setProfileError("Name cannot be empty.");
      return;
    }
    setProfileLoading(true);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      setProfileDone(true);
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setProfileLoading(false);
    }
  };

  /* ------------------------------------------------------------ password */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordDone(false);
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await fetch("/api/auth/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      setPasswordDone(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPasswordLoading(false);
    }
  };

  /* -------------------------------------------------------------- revoke */
  const [confirm, setConfirm] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeDone, setRevokeDone] = useState(false);

  const revoke = async () => {
    setRevokeError(null);
    if (confirm.toLowerCase() !== email.toLowerCase()) {
      setRevokeError("Type your email address to confirm.");
      return;
    }
    setRevokeLoading(true);
    try {
      const response = await fetch("/api/auth/sessions/revoke", {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      setRevokeDone(true);
      // The server revoked every earlier token and issued a fresh cookie for this
      // browser, so the person who pressed the button stays signed in here.
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRevokeLoading(false);
    }
  };

  const submitClass = cn(
    "inline-flex items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
    "h-10 px-4 text-[13px] rounded-xl gap-2 bg-gradient-to-b from-brand to-[#6847f0] text-white border border-brand/60",
  );

  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-2xl">
        <div className="eyebrow">{t("account.eyebrow")}</div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {t("account.title")}
        </h1>

        <Card className="mt-6 p-6">
          <h2 className="text-[13px] font-medium text-ink">
            {t("account.profile")}
          </h2>
          <form onSubmit={saveProfile} className="mt-4 space-y-4">
            <Field>
              <Label htmlFor="profile-name">{t("account.name")}</Label>
              <Input
                id="profile-name"
                type="text"
                maxLength={60}
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field>
              <Label htmlFor="profile-email">{t("account.email")}</Label>
              <Input id="profile-email" type="email" value={email} disabled />
            </Field>
            {profileError && (
              <p className="text-[12px] text-rose">{profileError}</p>
            )}
            {profileDone && (
              <p className="text-[12px] text-mint">
                {t("account.profileSaved")}
              </p>
            )}
            <button
              type="submit"
              disabled={profileLoading}
              className={submitClass}
            >
              {profileLoading
                ? t("common.loading")
                : t("account.profileSubmit")}
            </button>
          </form>
        </Card>

        <Card className="mt-4 p-6">
          <h2 className="text-[13px] font-medium text-ink">
            {t("account.password.title")}
          </h2>
          <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
            {t("account.password.body")}
          </p>
          {passwordDone ? (
            <p className="mt-3 text-[12px] text-mint">
              {t("account.password.done")}
            </p>
          ) : (
            <form onSubmit={savePassword} className="mt-4 space-y-4">
              <Field>
                <Label htmlFor="current-password">
                  {t("account.password.current")}
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="new-password">
                  {t("account.password.new")}
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  placeholder={t("account.password.newPlaceholder")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </Field>
              {passwordError && (
                <p className="text-[12px] text-rose">{passwordError}</p>
              )}
              <button
                type="submit"
                disabled={passwordLoading}
                className={submitClass}
              >
                {passwordLoading
                  ? t("common.loading")
                  : t("account.password.submit")}
              </button>
            </form>
          )}
        </Card>

        <Card className="mt-4 p-6">
          <h2 className="text-[13px] font-medium text-ink">
            {t("account.export.title")}
          </h2>
          <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
            {t("account.export.body")}
          </p>
          <a
            href="/api/auth/me/export"
            download
            className={cn(
              "mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-brand/50 hover:text-brand-soft",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-base",
            )}
          >
            {t("account.export.submit")}
          </a>
        </Card>

        <Card className="mt-4 p-6">
          <h2 className="text-[13px] font-medium text-ink">
            {t("account.revoke.title")}
          </h2>
          <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
            {t("account.revoke.body")}
          </p>
          {revokeDone ? (
            <p className="mt-3 text-[12px] text-mint">
              {t("account.revoke.done")}
            </p>
          ) : (
            <>
              <Field className="mt-4">
                <Label htmlFor="confirm">{t("account.revoke.confirm")}</Label>
                <Input
                  id="confirm"
                  type="email"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={email}
                />
              </Field>
              {revokeError && (
                <p className="mt-2 text-[12px] text-rose">{revokeError}</p>
              )}
              <button
                type="button"
                onClick={revoke}
                disabled={revokeLoading}
                className={cn(
                  "mt-4 inline-flex items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                  "h-10 px-4 text-[13px] rounded-xl gap-2 border border-rose/30 bg-rose/10 text-rose hover:bg-rose/15",
                )}
              >
                {revokeLoading ? "Revoking…" : t("account.revoke.submit")}
              </button>
            </>
          )}
        </Card>

        {children}

        <p className="mt-4 text-center text-[11.5px] text-fog">
          <Link href="/dashboard" className="text-brand-soft hover:text-brand">
            {t("account.back")}
          </Link>
        </p>
      </div>
    </div>
  );
}
