import { requireUser } from "@/server/current-user";
import { getAIProviderStatus } from "@/lib/ai";
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
    />
  );
}
