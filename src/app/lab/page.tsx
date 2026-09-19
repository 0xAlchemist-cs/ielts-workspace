import { redirect } from "next/navigation";

/** V15: AI Lab retired — sentence analysis lives inside the Reading Lab where
 *  it has context and writes evidence. Arbitrary-sentence showcase removed. */
export default function LabRedirectPage() {
  redirect("/");
}
