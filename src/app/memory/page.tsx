import { redirect } from "next/navigation";

/** V15: Learning Memory merged into Progress — one page answers "what is
 *  changing in my learning". The learning-memory service still feeds the
 *  planner and the profile insights section. */
export default function MemoryRedirectPage() {
  redirect("/profile");
}
