// What the owner agrees to pay for what they hand over. Before each paid
// request keepsake holds back the most that request can cost, which is far
// more than it usually does, so an estimate alone runs out before its last
// photos. The page and the server both use this, so it imports nothing.

/** How much more than the estimate an order or a change may cost. */
export const headroom = 1.5;

const cents = 100;
/** What floating point adds to a whole number of cents. */
const roundingSlack = 1e-6;

/**
 * The most the owner agrees to pay for work estimated at `estimate`
 * dollars: half as much again, and always enough that the hold of its last
 * edit fits once the others cost what they usually do.
 */
export const limitFor = (
  estimate: number,
  { perEdit, hold }: { readonly perEdit: number; readonly hold: number },
): number =>
  estimate <= 0
    ? 0
    : Math.ceil(
        Math.max(estimate * headroom, estimate - perEdit + hold) * cents -
          roundingSlack,
      ) / cents;
