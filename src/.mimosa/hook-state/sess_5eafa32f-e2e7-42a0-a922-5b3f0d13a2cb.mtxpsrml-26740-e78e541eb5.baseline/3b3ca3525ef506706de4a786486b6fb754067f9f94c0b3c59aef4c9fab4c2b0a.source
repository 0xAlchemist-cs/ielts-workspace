import Link from "next/link";
import { requireUser } from "@/server/current-user";
import { getBandGaps } from "@/server/services/ielts-engine";
import { IeltsEngineView } from "./engine";

export default async function IeltsPage() {
  const cu = await requireUser();
  const targetBand = cu.profile.ieltsOverall ?? 6.5;
  const bilingual = (cu.profile.immersionLevel ?? 1) <= 2;
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Link
          href="/ielts/mock"
          className="press rounded-lg bg-surface px-3.5 py-1.5 text-[12px] font-medium text-accent-text hover:bg-surface-2"
        >
          {bilingual ? "全真模考 Full Mock Exam →" : "Full Mock Exam →"}
        </Link>
      </div>
      <IeltsEngineView targetBand={targetBand} />
    </div>
  );
}
