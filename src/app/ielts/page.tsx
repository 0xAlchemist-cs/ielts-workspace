import { requireUser } from "@/server/current-user";
import { getBandGaps } from "@/server/services/ielts-engine";
import { IeltsEngineView } from "./engine";

export default async function IeltsPage() {
  const cu = await requireUser();
  const targetBand = cu.profile.ieltsOverall ?? 6.5;
  return <IeltsEngineView targetBand={targetBand} />;
}
