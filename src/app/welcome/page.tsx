import { getActiveExam } from "@/server/current-user";
import { WelcomeChooser } from "./chooser";

export const dynamic = "force-dynamic";

/* First-run entry: a chooser — guided first session (default), the category
 * tour, or skip straight into Today. IELTS first-timers pick a starting level
 * first (V9 personalization layer — CET profiles skip it entirely). */
export default async function WelcomePage() {
  const exam = await getActiveExam();
  return <WelcomeChooser needsLevel={exam === "ielts"} />;
}
