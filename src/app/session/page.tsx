import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission, markStepDone } from "@/server/services/mission";
import { getDashboardStats } from "@/server/services/progress";
import { SessionView, type SessionActivity } from "./view";
import type { MissionPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

/* ── V13.1 Learning Session — one continuous flow from Planner output ──────
 * The mission IS the session plan; this page orchestrates the sequence.
 * Activities execute inside existing modules (embedded via route transitions);
 * completion writes through existing markStepDone + evidence pipelines. */

type StepKey = "reading" | "listening" | "notice" | "deep" | "retrieval" | "speaking" | "transfer";

/** Build the ordered activity sequence from today's mission — only pending steps. */
function buildActivities(plan: MissionPlan, examProfile: string): SessionActivity[] {
  const acts: SessionActivity[] = [];

  // In lite mode, skip notice/deep/speaking (existing mission semantics)
  const lite = !!plan.lite;

  if (plan.reading.contentId && plan.reading.status === "pending") {
    acts.push({
      key: "reading", type: "reading",
      title: { en: plan.reading.title || "Read this article", zh: plan.reading.title || "读这篇文章" },
      desc: { en: "Read naturally — no test yet.", zh: "自然地读——现在还不考你。" },
      href: `/read/${plan.reading.contentId}`,
      minutes: plan.reading.minutes || 8,
      strength: plan.reading.strength ?? undefined,
      why: plan.reading.why,
    });
  }
  if (!lite && plan.listening.contentId && plan.listening.status === "pending") {
    acts.push({
      key: "listening", type: "listening",
      title: { en: plan.listening.title || "Listen to this", zh: plan.listening.title || "听这段材料" },
      desc: { en: "Listen for the overall meaning.", zh: "听大意——谁在说什么、为什么。" },
      href: `/listen/${plan.listening.contentId}`,
      minutes: plan.listening.minutes || 6,
      strength: plan.listening.strength ?? undefined,
      why: plan.listening.why,
    });
  }
  if (!lite && plan.notice.status === "pending") {
    acts.push({
      key: "notice", type: "notice",
      title: { en: "Notice useful expressions", zh: "注意有用的表达" },
      desc: { en: "While reading, tap the underlined expressions to save 2-3 to your bank.", zh: "阅读时点击划线的表达，存 2-3 个到你的语言库。" },
      href: plan.notice.contentId ? `/read/${plan.notice.contentId}` : plan.reading.contentId ? `/read/${plan.reading.contentId}` : "/library",
      minutes: 3,
    });
  }
  if (!lite && plan.deep.status === "pending") {
    acts.push({
      key: "deep", type: "deep",
      title: { en: "Use one expression yourself", zh: "自己用一次" },
      desc: { en: "Pick one expression and write your own sentence with it.", zh: "选一个表达，用一句话说说你自己的生活。" },
      href: "/chunks",
      minutes: 4,
    });
  }
  if (plan.retrieval.status === "pending") {
    acts.push({
      key: "retrieval", type: "retrieval",
      title: { en: "Recall from memory", zh: "凭记忆回忆" },
      desc: { en: "Answer from memory — that's what makes it stick.", zh: "凭记忆作答——这样才真正记得住。" },
      href: "/review",
      minutes: 7,
    });
  }
  if (!lite && plan.speaking.status === "pending") {
    acts.push({
      key: "speaking", type: "speaking",
      title: { en: "Speaking practice", zh: "口语练习" },
      desc: examProfile === "ielts"
        ? { en: "Copy your personalized prompt, practice with the external coach.", zh: "复制你的个性化提示词，用外部教练练习。" }
        : { en: "Practice speaking with the external coach.", zh: "用外部教练练口语。" },
      href: "/external",
      minutes: 5,
    });
  }
  if (plan.transfer.status === "pending") {
    acts.push({
      key: "transfer", type: "transfer",
      title: { en: "Use it in a new situation", zh: "在新情境中用一次" },
      desc: examProfile === "ielts"
        ? { en: "Apply today's language to an IELTS task.", zh: "把今天学的语言用到一个雅思任务里。" }
        : { en: "Apply today's language to a CET task.", zh: "把今天学的语言用到一个四六级任务里。" },
      href: examProfile === "ielts" ? "/ielts" : "/cet",
      minutes: 5,
    });
  }
  return acts;
}

export default async function SessionPage() {
  const cu = await requireUser();
  const userId = cu.user.id;
  const mission = await getOrCreateTodayMission(userId);
  const plan = mission.plan as MissionPlan;

  // Build the activity sequence + find where the user currently is
  const activities = buildActivities(plan, cu.user.examProfile);

  // Determine current step from plan statuses (first non-done non-skipped step)
  const allDone = mission.status === "completed";
  const currentIdx = allDone ? activities.length : Math.min(
    activities.findIndex((a) => {
      const step = plan[a.key as StepKey];
      return step && step.status === "pending";
    }),
    activities.length - 1,
  );
  const currentIdxSafe = currentIdx === -1 ? activities.length : currentIdx;

  const plannedMinutes = activities.reduce((a, b) => a + b.minutes, 0);

  return (
    <SessionView
      activities={activities}
      currentIdx={currentIdxSafe}
      allDone={allDone}
      plannedMinutes={plannedMinutes}
      missionId={mission.id}
      onComplete={async (step: string) => {
        "use server";
        await markStepDone(userId, step as StepKey);
      }}
    />
  );
}
