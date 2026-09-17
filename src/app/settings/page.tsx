import { requireUser } from "@/server/current-user";
import { getAIProviderStatus } from "@/lib/ai";
import { examConfig } from "@/lib/exam-profiles";
import { SettingsView } from "./view";

/* ── Settings — appearance, language, rhythm, AI provider. Nothing else. ──── */

export default async function SettingsPage() {
  const cu = await requireUser();
  return (
    <SettingsView
      userName={cu.user.name}
      immersionLevel={cu.profile.immersionLevel}
      dailyMinutes={cu.profile.dailyMinutes}
      aiStatus={getAIProviderStatus()}
      learningLevel={examConfig(cu.user.examProfile).hasCefrLayer ? cu.profile.cefr : undefined}
      examLabel={examConfig(cu.user.examProfile).label}
      examZh={examConfig(cu.user.examProfile).zh}
      targetBand={cu.user.examProfile === "ielts" ? cu.profile.targetBand ?? null : null}
    />
  );
}
