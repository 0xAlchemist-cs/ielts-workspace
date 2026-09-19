import { redirect } from "next/navigation";

/** V15: internal speaking lab retired — speaking practice is external (coach
 *  GPT via /ielts); the workspace keeps the evidence, not a recorder. */
export default function SpeakingRedirectPage() {
  redirect("/ielts");
}
