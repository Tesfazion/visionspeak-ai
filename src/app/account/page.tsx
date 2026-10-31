import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, loginHref } from "@/lib/auth";
import { AccountSettingsForm } from "./account-form";
import { BillingStatus } from "@/components/account/billing-status";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your VisionSpeak account and session security.",
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/account"));

  return (
    <AccountSettingsForm email={user.email} name={user.name}>
      <BillingStatus plan={user.plan} />
    </AccountSettingsForm>
  );
}