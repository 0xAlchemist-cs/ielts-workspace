import { WelcomeChooser } from "./chooser";

export const dynamic = "force-dynamic";

/* First-run entry: a chooser — guided first session (default), the category
 * tour, or skip straight into Today. User bootstrap happens on any completion
 * (completeTourAction); the loop page also ensures the user exists. */
export default function WelcomePage() {
  return <WelcomeChooser />;
}
