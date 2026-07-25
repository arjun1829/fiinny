import type { RankingSignal } from "../types";

/**
 * Commercial intent — a reel with a linked product is the whole point of
 * the feature. Mirrors domain/signals/commercial_signal.dart (mobile),
 * minus the `productNearViewer` boost to 1.0: that needs a resolved viewer
 * location, which an anonymous SSR page doesn't have, so this always scores
 * the base 0.6.
 */
export const commercialSignal: RankingSignal = {
  id: "commercial",
  score(reel) {
    return reel.linkedProductId ? 0.6 : 0;
  },
};
