/* Guard probe for scripts/verify-test-isolation.ts — opens src/db and
 * exits 0 on success, 3 if the module refuses to load (the test-isolation
 * guard throws at import time). Invoked as a FILE so no nested shell
 * quoting is involved on Windows. */
import("../src/db")
  .then(() => console.log("opened"))
  .catch((e: Error) => {
    console.error(e.message);
    process.exit(3);
  });
