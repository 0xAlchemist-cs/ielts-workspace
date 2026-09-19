import { redirect } from "next/navigation";

/** V15: External Hub merged into the IELTS page — it is the single front
 *  door for external practice (reading/full → IELTSCB, speaking/listening →
 *  coach GPT) plus report import. */
export default function ExternalRedirectPage() {
  redirect("/ielts");
}
