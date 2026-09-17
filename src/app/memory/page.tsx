import { requireUser } from "@/server/current-user";
import { buildLearningMemory } from "@/server/services/learning-memory";
import { MemoryView } from "./view";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const cu = await requireUser();
  const memory = await buildLearningMemory(cu.user.id);
  return <MemoryView memory={memory} />;
}
