import { redirect } from "next/navigation";

/** V14.2: the internal full mock is retired — real exams happen on external
 *  sites and reports are imported. Old links land on the IELTS page (its
 *  External Practice area is the front door), never a 404. */
export default function MockRedirectPage() {
  redirect("/ielts");
}
