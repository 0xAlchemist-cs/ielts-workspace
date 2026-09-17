import { requireUser } from "@/server/current-user";
import { loadCetTasks } from "@/server/services/cet-engine";
import { CetPracticeView } from "./view";

export const dynamic = "force-dynamic";

/* ── CET written-test practice — sections per the official syllabus ──────── */

export default async function CetPracticePage() {
  const cu = await requireUser();
  const exam = cu.user.examProfile;
  if (exam !== "cet4" && exam !== "cet6") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-display">CET Practice</h1>
        <p className="mt-2 text-[13px] text-ink-2">
          CET practice is available under the CET-4 or CET-6 goal — switch it from the top bar.
        </p>
      </div>
    );
  }
  const tasks = await loadCetTasks(exam);
  return <CetPracticeView exam={exam} tasks={tasks} />;
}
