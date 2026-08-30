/**
 * Every fragment, wrapped to record which one is running — for the
 * Explorer's queue panel, which groups steps by the reusable move that wrote
 * them.
 *
 * `fragments/compositions.ts` imports from here instead of `./index`; every
 * call site is unchanged, because each wrapped function keeps its original
 * name and signature. Nothing about a fragment's behaviour changes — this
 * only widens what `fragments/derive.ts` can see when an event is recorded.
 */
import * as fragments from "./index";
import { currentFragment } from "./provenance";

function tag<Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const previous = currentFragment.name;
    currentFragment.name = name;
    try {
      return await fn(...args);
    } finally {
      currentFragment.name = previous;
    }
  };
}

export const askAndPursue = tag("askAndPursue", fragments.askAndPursue);
export const multiPursuit = tag("multiPursuit", fragments.multiPursuit);
export const prespecify = tag("prespecify", fragments.prespecify);
export const gatedWork = tag("gatedWork", fragments.gatedWork);
export const observeAndAnalyse = tag("observeAndAnalyse", fragments.observeAndAnalyse);
export const negativeResult = tag("negativeResult", fragments.negativeResult);
export const failedCheck = tag("failedCheck", fragments.failedCheck);
export const rerunCheck = tag("rerunCheck", fragments.rerunCheck);
export const promoteFinding = tag("promoteFinding", fragments.promoteFinding);
export const closeOnEvidence = tag("closeOnEvidence", fragments.closeOnEvidence);
export const acceptUnresolved = tag("acceptUnresolved", fragments.acceptUnresolved);
export const replaceAnalysis = tag("replaceAnalysis", fragments.replaceAnalysis);
export const reinterpretClaim = tag("reinterpretClaim", fragments.reinterpretClaim);
export const reverifyEarlier = tag("reverifyEarlier", fragments.reverifyEarlier);
export const sharpenQuestion = tag("sharpenQuestion", fragments.sharpenQuestion);
export const amendLockedDesign = tag("amendLockedDesign", fragments.amendLockedDesign);
