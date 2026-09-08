import { requireUser } from "@/server/current-user";
import { buildMockPaper, todaySeed } from "@/server/services/mock-paper";
import { MockExam } from "./exam";

export const dynamic = "force-dynamic";

export default async function MockExamPage() {
  await requireUser();
  const { seed, dateKey } = todaySeed();
  const paper = await buildMockPaper(seed, dateKey);
  return <MockExam paper={paper} />;
}
