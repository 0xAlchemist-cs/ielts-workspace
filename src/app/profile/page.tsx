import { requireUser } from "@/server/current-user";
import { getTrend14, getTodayEvidence, getTodayFunnel } from "@/server/services/progress";
import { computeFullProfile } from "@/server/services/learning-profile";
import { getUserVocabulary, getUserChunks } from "@/server/services/bank";
import { retrievalStats } from "@/server/services/retrieval";
import { getListeningProfile, missStats } from "@/server/services/listening";
import { getTrajectory, getLearningEfficiency, generateWeeklyReview } from "@/server/services/trajectory";
import { buildReadiness } from "@/server/services/readiness";
import { ProfileView } from "./view";

export default async function ProfilePage() {
  const cu = await requireUser();
  const userId = cu.user.id;

  const [fullProfile, trend, vocab, chunks, retrieval, lProfile, lMisses, trajectory, efficiency, weekly, funnel, evidence, readiness] =
    await Promise.all([
      computeFullProfile(userId),
      getTrend14(userId),
      getUserVocabulary(userId),
      getUserChunks(userId),
      retrievalStats(userId),
      getListeningProfile(userId),
      missStats(userId),
      getTrajectory(userId, 30),
      getLearningEfficiency(userId),
      generateWeeklyReview(userId),
      getTodayFunnel(userId),
      getTodayEvidence(userId),
      buildReadiness(userId, cu.user.examProfile),
    ]);

  return (
    <ProfileView
      profile={{
        ieltsOverall: cu.profile.ieltsOverall,
        ieltsListening: cu.profile.ieltsListening,
        ieltsReading: cu.profile.ieltsReading,
        ieltsWriting: cu.profile.ieltsWriting,
        ieltsSpeaking: cu.profile.ieltsSpeaking,
        cefr: cu.profile.cefr,
        immersionLevel: cu.profile.immersionLevel,
        dailyMinutes: cu.profile.dailyMinutes,
        grammarWeaknesses: cu.profile.grammarWeaknesses,
        speakingWeaknesses: cu.profile.speakingWeaknesses,
        listeningWeaknesses: cu.profile.listeningWeaknesses,
      }}
      fullProfile={fullProfile}
      trajectory={{
        trends: trajectory.trends,
        bottleneck: trajectory.bottleneck,
        plateau: trajectory.plateau,
        acceleration: trajectory.acceleration,
        snapshotCount: trajectory.snapshots.length,
      }}
      efficiency={efficiency}
      weeklyReview={weekly}
      stats={{
        activeVocabulary: vocab.filter((v) => v.status === "active").length,
        passiveVocabulary: vocab.filter((v) => v.status === "passive").length,
        activeChunks: chunks.filter((c) => c.activatedAt !== null).length,
        retrievalAccuracy: retrieval.accuracy30d,
        averageStrength: Math.round(chunks.reduce((a, c) => a + c.retrievalStrength, 0) / Math.max(chunks.length, 1)),
        daysStudied: 0,
        dueNow: retrieval.dueNow,
        totalItems: retrieval.totalItems,
        todayFunnel: funnel,
        vocabStatusCounts: {
          passive: vocab.filter((v) => v.status === "passive").length,
          active: vocab.filter((v) => v.status === "active").length,
        },
        chunkCount: chunks.length,
        trend,
        listening: { profile: lProfile, misses: lMisses },
      }}
      funnel={funnel}
      readiness={readiness}
      evidence={evidence}
    />
  );
}
