import { WelcomeTour } from "./tour";

export const dynamic = "force-dynamic";

/* The first-run tour: meet every category before doing any work. User
 * bootstrap happens on tour completion (completeTourAction); the optional
 * guided first loop lives at /welcome/loop. */
export default function WelcomePage() {
  return <WelcomeTour />;
}
