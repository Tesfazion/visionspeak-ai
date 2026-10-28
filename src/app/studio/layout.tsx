import { redirect } from "next/navigation";
import { getCurrentUser, loginHref } from "@/lib/auth";

/**
 * The studio page is a client component (camera lifecycle, live state), so the
 * auth gate lives in its server layout. `next=/studio` brings the visitor back
 * here after signing in.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/studio"));
  return children;
}
