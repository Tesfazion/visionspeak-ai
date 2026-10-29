import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site/footer";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your VisionSpeak account.",
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();
  return (
    <>
      <ResetPasswordForm token={token} />
      <SiteFooter />
    </>
  );
}