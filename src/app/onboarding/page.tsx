import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/current-user";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const cu = await getCurrentUser();
  if (cu) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#0071e3] font-mono text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(0,113,227,0.35)]">
            IW
          </div>
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.022em] text-ink">
            Your English System
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">
            Not a quiz app. A workspace that trains the loop:{" "}
            <span className="font-medium text-ink">input → noticing → deep processing → retrieval → output → feedback → reuse.</span>
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
