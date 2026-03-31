import { getCurrentUser } from "../actions/user";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Minimal full-page layout for the editor.
 * No sidebar, no ContentCard — the editor fills 100vh.
 * Auth + onboarding checks mirror the dashboard layout.
 */
export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/sign-in");
  }

  if (!currentUser.onboardingCompleted) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
