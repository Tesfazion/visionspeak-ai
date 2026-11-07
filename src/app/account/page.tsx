import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, loginHref } from "@/lib/auth";
import { AccountSettingsForm } from "./account-form";
import { AiKeysPanel } from "@/components/ai/ai-keys-panel";
import { BillingStatus } from "@/components/account/billing-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your VisionSpeak account and session security.",
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/account"));

  return (
    <AccountSettingsForm email={user.email} name={user.name}>
      <BillingStatus
        plan={user.plan}
        billing={user.billing}
        checkoutConfigured={Boolean(
          process.env.LEMON_SQUEEZY_API_KEY &&
            process.env.LEMON_SQUEEZY_STORE_ID &&
            process.env.LEMON_SQUEEZY_WEBHOOK_SECRET &&
            process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID,
        )}
      />
      <AiKeysPanel />
    </AccountSettingsForm>
  );
}