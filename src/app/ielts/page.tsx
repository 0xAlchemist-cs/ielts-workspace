import { requireUser } from "@/server/current-user";
import { IeltsEngineView } from "./engine";
import { ExternalPractice } from "./external-practice";
import { ExternalReportsCard } from "./reports-list";

export default async function IeltsPage() {
  const cu = await requireUser();
  const targetBand = cu.profile.ieltsOverall ?? 6.5;
  return (
    <div>
      {/* V14.2: real exams happen outside; the workspace imports reports and
       * settles ability. The internal full mock is retired. */}
      <ExternalPractice />
      <div className="mt-5">
        <IeltsEngineView targetBand={targetBand} />
      </div>
      <ExternalReportsCard />
    </div>
  );
}
