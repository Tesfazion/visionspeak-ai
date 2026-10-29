import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site/footer";
import { VerifyEmailForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Email verified",
  description: "Confirm your email address to complete your VisionSpeak account.",
};

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();
  return (
    <>
      <VerifyEmailForm token={token} />
      <SiteFooter />
    </>
  );
}