import { Metadata } from "next";
import { SiteFooter } from "@/components/site/footer";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your VisionSpeak password. We email a link to the address on your account.",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <ForgotPasswordForm />
      <SiteFooter />
    </>
  );
}