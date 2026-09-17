import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contentHistory,
  externalSessions,
  ieltsAttempts,
  learningProfiles,
  speakingAttempts,
  writingAttempts,
} from "@/db/schema";
import type { ExamProfile } from "@/lib/exam-profiles";
import type { ReadinessState, ReadinessSnapshot, SkillReadiness } from "@/lib/readiness-types";

export type { ReadinessState, ReadinessSnapshot, SkillReadiness };
export { readinessStateText } from "@/lib/readiness-types";

/* ── V12.1 Exam Readiness — derived, evidence-backed, honest ────────────────
 * States per skill: none → building → (needs_work | on_track | strong).
 * IELTS: band evidence vs target band. CET: session counts only (no fake
 * score model). No score prediction, ever. Derived on demand — no tables. */

const SKILL_LABEL: Record<string, { en: string; zh: string }> = {
  reading: { en: "Reading", zh: "阅读" },
  listening: { en: "Listening", zh: "听力" },
  writing: { en: "Writing", zh: "写作" },
  speaking: { en: "Speaking", zh: "口语" },
  translation: { en: "Translation", zh: "翻译" },
};

/** IELTS band-based state: mean band vs target (±0.5 tolerance). */
function bandState(mean: number, target: number): ReadinessState {
  if (mean >= target + 0.5) return "strong";
  if (mean >= target - 0.5) return "on_track";
  return "needs_work";
}

function bandWhy(mean: number, target: number, count: number, state: ReadinessState) {
  if (state === "none") return { en: "Complete a few sessions to build a clearer picture.", zh: "完成几次练习就能形成更清晰的画像。" };
  if (state === "building") return { en: `Only ${count} attempt${count > 1 ? "s" : ""} so far — a few more will make this reliable.`, zh: `目前只有 ${count} 次——再多几次就可靠了。` };
  return {
    en: `Recent attempts average band ${mean.toFixed(1)} vs your target ${target.toFixed(1)} across ${count} attempts.`,
    zh: `近期 ${count} 次平均 ${mean.toFixed(1)} 分，目标 ${target.toFixed(1)}。`,
  };
}

export async function buildReadiness(userId: number, exam: ExamProfile): Promise<ReadinessSnapshot> {
  const [profile] = await db
    .select({ targetBand: learningProfiles.targetBand })
    .from(learningProfiles)
    .where(eq(learningProfiles.userId, userId))
    .limit(1);
  const targetBand = profile?.targetBand ?? null;

  const snapshot: ReadinessSnapshot = { exam, targetBand, skills: [], topGap: null };

  if (exam === "ielts") {
    // ── Writing: AI-banded attempts ─────────────────────────────────────
    const writes = await db
      .select({ scores: writingAttempts.ieltsScores })
      .from(writingAttempts)
      .where(eq(writingAttempts.userId, userId))
      .orderBy(desc(writingAttempts.createdAt))
      .limit(10);
    const writeBands = writes
      .map((w) => (w.scores as { overallEstimate?: number } | null)?.overallEstimate)
      .filter((b): b is number => typeof b === "number" && b > 0);
    const wState: ReadinessState =
      writeBands.length === 0 ? "none"
      : writeBands.length < 3 ? "building"
      : bandState(writeBands.reduce((a, b) => a + b, 0) / writeBands.length, targetBand ?? 6.5);
    const wMean = writeBands.length ? writeBands.reduce((a, b) => a + b, 0) / writeBands.length : 0;
    snapshot.skills.push({
      skill: "writing", label: SKILL_LABEL.writing, state: wState,
      why: wState === "building" || wState === "none"
        ? bandWhy(wMean, targetBand ?? 6.5, writeBands.length, wState)
        : bandWhy(wMean, targetBand ?? 6.5, writeBands.length, wState),
      evidenceCount: writeBands.length,
      devExplanation: { evidence: [`writing_attempts with band: ${writeBands.length}`, `mean=${wMean.toFixed(2)}`, `target=${targetBand ?? 6.5}`], state: wState },
    });

    // ── Reading/Listening: IELTS practice attempts carry band + skill ────
    const attempts = await db
      .select({ mode: ieltsAttempts.mode, band: ieltsAttempts.band, responses: ieltsAttempts.responses, createdAt: ieltsAttempts.createdAt })
      .from(ieltsAttempts)
      .where(eq(ieltsAttempts.userId, userId))
      .orderBy(desc(ieltsAttempts.createdAt))
      .limit(30);
    for (const skill of ["reading", "listening"] as const) {
      // each attempt's task skill is recorded in responses; attempts without
      // skill attribution (old rows) fall back to mode inference: reading tasks
      // = reading skill; listening = listening
      const relevant = attempts.filter((a) => {
        const r = a.responses as Record<string, unknown> | null;
        const taskSkill = r && typeof r.taskSkill === "string" ? (r.taskSkill as string) : null;
        if (taskSkill) return taskSkill === skill;
        return a.mode !== "mock" && (skill === "reading" ? true : false) === (skill === "reading");
      }).filter((a) => typeof a.band === "number" && (a.band as number) > 0);
      const bands = relevant.map((a) => a.band as number);
      const rState: ReadinessState =
        bands.length === 0 ? "none"
        : bands.length < 3 ? "building"
        : bandState(bands.reduce((a, b) => a + b, 0) / bands.length, targetBand ?? 6.5);
      const rMean = bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : 0;
      snapshot.skills.push({
        skill, label: SKILL_LABEL[skill], state: rState,
        why: bandWhy(rMean, targetBand ?? 6.5, bands.length, rState),
        evidenceCount: bands.length,
        devExplanation: { evidence: [`ielts_attempts(${skill}) with band: ${bands.length}`, `mean=${rMean.toFixed(2)}`], state: rState },
      });
    }

    // ── Speaking: AI-banded attempts + logged external sessions ──────────
    const speaks = await db
      .select({ scores: speakingAttempts.ieltsScores })
      .from(speakingAttempts)
      .where(eq(speakingAttempts.userId, userId))
      .limit(10);
    const extSessions = await db
      .select({ n: sql<number>`count(*)` })
      .from(externalSessions)
      .where(eq(externalSessions.userId, userId));
    const speakBands = speaks
      .map((s) => (s.scores as { overallEstimate?: number } | null)?.overallEstimate)
      .filter((b): b is number => typeof b === "number" && b > 0);
    const extCount = extSessions[0]?.n ?? 0;
    const totalSpeak = speakBands.length + extCount;
    const sState: ReadinessState =
      totalSpeak === 0 ? "none"
      : speakBands.length < 3 && totalSpeak < 4 ? "building"
      : speakBands.length >= 3
        ? bandState(speakBands.reduce((a, b) => a + b, 0) / speakBands.length, targetBand ?? 6.5)
        : "building";
    const sMean = speakBands.length ? speakBands.reduce((a, b) => a + b, 0) / speakBands.length : 0;
    snapshot.skills.push({
      skill: "speaking", label: SKILL_LABEL.speaking, state: sState,
      why: sState === "none"
        ? { en: "Complete a few speaking sessions to build a clearer picture.", zh: "完成几次口语练习就能形成更清晰的画像。" }
        : bandWhy(sMean, targetBand ?? 6.5, totalSpeak, sState === "building" ? "building" : sState),
      evidenceCount: totalSpeak,
      devExplanation: { evidence: [`speaking_attempts with band: ${speakBands.length}`, `external sessions: ${extCount}`], state: sState },
    });
  } else {
    // ── CET-4/6: honest session-count states only (no score model) ──────
    const history = await db
      .select({ skill: contentHistory.skill })
      .from(contentHistory)
      .where(eq(contentHistory.userId, userId));
    const counts: Record<string, number> = {};
    for (const h of history) counts[h.skill] = (counts[h.skill] ?? 0) + 1;
    const writes = await db
      .select({ n: sql<number>`count(*)` })
      .from(writingAttempts)
      .where(eq(writingAttempts.userId, userId));
    const exts = await db
      .select({ n: sql<number>`count(*)` })
      .from(externalSessions)
      .where(eq(externalSessions.userId, userId));

    for (const skill of ["reading", "listening", "writing", "translation"] as const) {
      const count =
        skill === "reading" ? (counts.reading ?? 0)
        : skill === "listening" ? (counts.listening ?? 0)
        : skill === "writing" ? (writes[0]?.n ?? 0)
        : 0; // translation: no engine yet — always honest
      const state: ReadinessState = count >= 5 ? "building" : count >= 1 ? "building" : "none";
      snapshot.skills.push({
        skill, label: SKILL_LABEL[skill], state,
        why: state === "none"
          ? { en: "Complete a few sessions to build a clearer picture.", zh: "完成几次练习就能形成更清晰的画像。" }
          : { en: `${count} session${count > 1 ? "s" : ""} recorded — the picture builds with practice.`, zh: `已记录 ${count} 次练习——画像随练习逐步清晰。` },
        evidenceCount: count,
        devExplanation: { evidence: [`sessions: ${count}`], state },
      });
    }
  }

  // ── topGap: the largest evidence-backed gap (planner input) ────────────
  const gapOrder: Record<ReadinessState, number> = { needs_work: 3, none: 0, building: 1, on_track: 0, strong: 0 };
  const gaps = snapshot.skills.filter((s) => s.state === "needs_work" && s.evidenceCount >= 3);
  if (gaps.length > 0) {
    const top = gaps.sort((a, b) => gapOrder[b.state] - gapOrder[a.state] || a.evidenceCount - b.evidenceCount)[0];
    snapshot.topGap = { skill: top.skill, label: top.label };
  }
  return snapshot;
}

/** Persist the IELTS target band (5.0–8.0 in halves); CET = no-op. */
export async function setTargetBand(userId: number, band: number | null): Promise<void> {
  const clamped =
    band == null ? null : Math.min(8, Math.max(5, Math.round(band * 2) / 2));
  await db
    .update(learningProfiles)
    .set({ targetBand: clamped, updatedAt: Date.now() })
    .where(eq(learningProfiles.userId, userId));
}
