import { redirect } from "next/navigation";

/** V15: legacy onboarding retired — /welcome is the first-run flow. */
export default function OnboardingRedirectPage() {
  redirect("/welcome");
}
