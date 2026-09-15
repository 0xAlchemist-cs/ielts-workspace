import { WelcomeTour } from "../tour";

export const dynamic = "force-dynamic";

/* The category tour ("what each part is for"), kept from the previous round —
 * reachable from the welcome chooser. Finishing lands on Today with the
 * beginner branch retired. */
export default function WelcomeTourPage() {
  return <WelcomeTour />;
}
