import { requireUser } from "@/server/current-user";
import { listErrors } from "@/server/services/bank";
import { ErrorBankView } from "./view";

export default async function ErrorsPage() {
  const cu = await requireUser();
  const rows = await listErrors(cu.user.id, true);
  return (
    <ErrorBankView
      errors={rows.map((e) => ({
        id: e.id,
        category: e.category,
        wrongForm: e.wrongForm,
        correctForm: e.correctForm,
        explanation: e.explanation,
        occurrenceCount: e.occurrenceCount,
        source: e.source,
        status: e.status,
      }))}
    />
  );
}
