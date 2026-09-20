/** Shared session-plan builder — the SINGLE source of truth for what today's
 *  session contains. Both /session and the Today card read their activity
 *  count and minute estimate from here (V16 hardening: the beta pilot caught
 *  Today showing "4 activities · 45–60 min" while the session showed
 *  "5 items · 24 min" — two different reckonings for the same day).
 *
 *  Also owns the cold-start rule (beta pilot P1): when the learner's language
 *  library is EMPTY, the NOTICE and USE-IT activities deep-link to the
 *  existing Discover tab instead of dead-ending in an empty Library/bank.
 *  No new engine — pure routing of existing surfaces. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT } from "@/db/schema";
import type { MissionPlan } from "@/lib/types";

export interface SessionActivity {
  key: string;
  type: string;
  title: { en: string; zh: string };
  desc: { en: string; zh: string };
  href: string;
  minutes: number;
  /** difficulty vs learner level + why this piece — reading/listening only */
  strength?: { en: string | null; zh: string | null };
  why?: { en: string; zh: string };
  /** cold-start: finishing requires the learner to have saved ≥1 real item */
  requiresItem?: boolean;
}

export interface SessionPlanSummary {
  /** activities still pending, in execution order (what /session runs) */
  activities: SessionActivity[];
  /** position (1-based) of the current activity within ALL of today's
   *  non-skipped steps — stable denominator; done steps don't shrink it */
  position: number;
  /** all non-skipped steps today, done + pending */
  totalCount: number;
  /** minutes summed over ALL non-skipped steps (stable journey estimate) */
  totalMinutes: number;
  /** minutes summed over PENDING steps only (what Today advertises) */
  pendingMinutes: number;
  pendingCount: number;
  /** does the learner have ≥1 saved language item (chunk)? */
  hasItems: boolean;
}

type StepKey = "reading" | "listening" | "notice" | "deep" | "retrieval" | "speaking" | "transfer";

const DISCOVER_HREF = "/chunks?tab=discover";

/** Build one activity per plan step. `hasItems` only reroutes the two
 *  expression-dependent steps when the bank is empty (cold start). */
function buildActs(plan: MissionPlan, examProfile: string, hasItems: boolean): SessionActivity[] {
  const acts: SessionActivity[] = [];
  const lite = !!plan.lite;
  const cold = !hasItems;

  if (plan.reading.contentId && plan.reading.status !== "skipped") {
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
  if (!lite && plan.listening.contentId && plan.listening.status !== "skipped") {
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
  if (!lite && plan.notice.status !== "skipped") {
    acts.push(
      cold
        ? {
            key: "notice", type: "notice",
            title: { en: "Notice useful expressions", zh: "注意有用的表达" },
            desc: {
              en: "Your bank is empty — find one expression first, then we'll continue. Pick a useful expression in Discover and save it.",
              zh: "你的语言库还是空的——先找一个表达，我们再继续。在“发现”里挑一个有用的表达存入。",
            },
            href: DISCOVER_HREF,
            minutes: 3,
            requiresItem: true,
          }
        : {
            key: "notice", type: "notice",
            title: { en: "Notice useful expressions", zh: "注意有用的表达" },
            desc: { en: "While reading, tap the underlined expressions to save 2-3 to your bank.", zh: "阅读时点击划线的表达，存 2–3 个到你的语言库。" },
            href: plan.notice.contentId ? `/read/${plan.notice.contentId}` : plan.reading.contentId ? `/read/${plan.reading.contentId}` : "/library",
            minutes: 3,
          },
    );
  }
  if (!lite && plan.deep.status !== "skipped") {
    acts.push(
      cold
        ? {
            key: "deep", type: "deep",
            title: { en: "Use one expression yourself", zh: "自己用一次" },
            desc: {
              en: "Pick one from the expressions you just found in Discover and write your own sentence with it.",
              zh: "从你刚在“发现”里遇到的表达里选一个，用一句话说说你自己的生活。",
            },
            href: "/chunks",
            minutes: 4,
            requiresItem: true,
          }
        : {
            key: "deep", type: "deep",
            title: { en: "Use one expression yourself", zh: "自己用一次" },
            desc: { en: "Pick one expression and write your own sentence with it.", zh: "选一个表达，用一句话说说你自己的生活。" },
            href: "/chunks",
            minutes: 4,
          },
    );
  }
  if (plan.retrieval.status !== "skipped") {
    acts.push({
      key: "retrieval", type: "retrieval",
      title: { en: "Recall from memory", zh: "凭记忆回忆" },
      desc: { en: "Answer from memory — that's what makes it stick.", zh: "凭记忆作答——这样才真正记得住。" },
      href: "/review",
      minutes: 7,
    });
  }
  if (!lite && plan.speaking.status !== "skipped") {
    acts.push({
      key: "speaking", type: "speaking",
      title: { en: "Speaking practice", zh: "口语练习" },
      desc:
        examProfile === "ielts"
          ? { en: "Copy your personalized prompt, practice with the external coach.", zh: "复制你的个性化提示词，用外部教练练习。" }
          : { en: "Practice speaking with the external coach.", zh: "用外部教练练口语。" },
      href: "/external",
      minutes: 5,
    });
  }
  if (plan.transfer.status !== "skipped") {
    acts.push({
      key: "transfer", type: "transfer",
      title: { en: "Use it in a new situation", zh: "在新情境中用一次" },
      desc:
        examProfile === "ielts"
          ? { en: "Apply today's language to an IELTS task.", zh: "把今天学的语言用到一个雅思任务里。" }
          : { en: "Apply today's language to a CET task.", zh: "把今天学的语言用到一个四六级任务里。" },
      href: examProfile === "ielts" ? "/ielts" : "/cet",
      minutes: 5,
    });
  }
  return acts;
}

export async function buildSessionPlan(
  plan: MissionPlan,
  examProfile: string,
  userId: number,
): Promise<SessionPlanSummary> {
  const itemRows = await db
    .select({ id: chunksT.id })
    .from(chunksT)
    .where(eq(chunksT.userId, userId))
    .limit(1);
  const hasItems = itemRows.length > 0;

  const all = buildActs(plan, examProfile, hasItems); // non-skipped steps, execution order
  const pending = all.filter((a) => {
    const step = plan[a.key as StepKey];
    return step && step.status === "pending";
  });
  const currentKey = pending[0]?.key;
  const position = currentKey ? all.findIndex((a) => a.key === currentKey) + 1 : all.length;

  return {
    activities: pending,
    position,
    totalCount: all.length,
    totalMinutes: all.reduce((a, b) => a + b.minutes, 0),
    pendingMinutes: pending.reduce((a, b) => a + b.minutes, 0),
    pendingCount: pending.length,
    hasItems,
  };
}
