import { redirect } from "next/navigation";
import { getCurrentUser, loginHref } from "@/lib/auth";

/**
 * The studio page is a client component (camera lifecycle, live state), so the
 * auth gate lives in its server layout. `next=/studio` brings the visitor back
 * here after signing in.
 *
 * If the user is signed in but email is not verified, redirect to verify so they
 * can confirm before accessing the camera/studio.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/studio"));
  if (!user.emailVerifiedAt) redirect("/verify-email");
  return children;
}
