import { getActiveExam } from "@/server/current-user";
import { examConfig } from "@/lib/exam-profiles";
import { WelcomeChooser } from "./chooser";

export const dynamic = "force-dynamic";

/* First-run entry: a chooser — guided first session (default), the category
 * tour, or skip straight into Today. Exams with the CEFR layer (IELTS) pick
 * a starting level first; CET profiles skip it entirely. */
export default async function WelcomePage() {
  const exam = await getActiveExam();
  return <WelcomeChooser needsLevel={examConfig(exam).hasCefrLayer} />;
}
