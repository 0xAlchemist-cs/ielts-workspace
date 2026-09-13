import { LEARNING_STATES, type ItemLearningState, type LearningState, type ModuleContext, type RetrievalItemType, type ReviewMode } from "@/lib/types";

/* ── Retrieval Format Engine ────────────────────────────────────────────────
 * Given a LanguageItem's current learning state and history, decide HOW to
 * retrieve it next. The format escalates with mastery — never plateau at
 * "recognize the answer", always push toward "produce from memory in a
 * new context". */

export interface RetrievalFormat {
  mode: ReviewMode;
  rationale: string; // why this format, in learner-friendly terms
  stateAfterSuccess: LearningState;
  stateAfterFailure: LearningState;
}

const STATE_INDEX: Record<LearningState, number> = Object.fromEntries(
  LEARNING_STATES.map((s, i) => [s, i]),
) as Record<LearningState, number>;

function nextState(state: LearningState): LearningState {
  const idx = STATE_INDEX[state];
  return LEARNING_STATES[Math.min(idx + 1, LEARNING_STATES.length - 1)] as LearningState;
}

function prevState(state: LearningState): LearningState {
  const idx = STATE_INDEX[state];
  return LEARNING_STATES[Math.max(idx - 1, 0)] as LearningState;
}

/**
 * THE core decision: what retrieval format should this item use next?
 *
 * State ladder → format:
 *   exposure       → recognition (scaffold: pick from choices / identify by ear)
 *   understanding  → recognition (still scaffolding, but audio if possible)
 *   recognition    → cued_recall (first letter / definition → produce the word)
 *   retrieval      → production (Chinese cue → full English production)
 *                   OR cloze (sentence blank → fill from context)
 *   usage          → context_transfer (NEW scenario, different module)
 *   transfer       → audio_retrieval (hear the situation, produce the chunk)
 *   retention      → maintenance: alternate production / cloze / audio
 */
export function decideFormat(
  itemType: RetrievalItemType,
  learningState: ItemLearningState,
  lastContext?: ModuleContext,
): RetrievalFormat {
  const state = learningState.state;

  // Errors always use production (fix-it format) regardless of state
  if (itemType === "error") {
    return {
      mode: "production",
      rationale: "Error Bank items require production — you must produce the correct form, not recognize it.",
      stateAfterSuccess: "retrieval",
      stateAfterFailure: "exposure",
    };
  }

  switch (state) {
    case "exposure":
      return {
        mode: "recognition",
        rationale: "First encounter — scaffold with choices. You've seen it but not produced it yet.",
        stateAfterSuccess: "recognition",
        stateAfterFailure: "exposure",
      };

    case "understanding":
      return {
        mode: "recognition",
        rationale: "You understand the meaning but haven't recalled it yet — recognition builds the bridge.",
        stateAfterSuccess: "recognition",
        stateAfterFailure: "understanding",
      };

    case "recognition":
      return {
        mode: "cued_recall",
        rationale: "You can recognize it — now produce it with a scaffold (definition + first letter).",
        stateAfterSuccess: "retrieval",
        stateAfterFailure: "recognition",
      };

    case "retrieval": {
      // Alternate between pure production and cloze for variety
      const useCloze = learningState.contextualHits + learningState.contextualMisses <
        learningState.productionHits + learningState.productionMisses;
      return {
        mode: useCloze ? "cloze" : "production",
        rationale: useCloze
          ? "Fill the blank in context — situational retrieval."
          : "See the Chinese, produce the English from memory.",
        stateAfterSuccess: "usage",
        stateAfterFailure: "retrieval",
      };
    }

    case "usage":
      return {
        mode: "context_transfer",
        rationale: "You've used it in your own sentence — now transfer it to a completely different scenario.",
        stateAfterSuccess: "transfer",
        stateAfterFailure: "usage",
      };

    case "transfer": {
      // If the item has been used in ≥2 module contexts, push to audio retrieval
      const crossModule = learningState.contexts.length >= 2;
      if (crossModule) {
        return {
          mode: "audio_retrieval",
          rationale: "You've used it across modules — now retrieve it by hearing a situation.",
          stateAfterSuccess: "retention",
          stateAfterFailure: "transfer",
        };
      }
      return {
        mode: "context_transfer",
        rationale: "Still single-context — one more transfer before retention.",
        stateAfterSuccess: "transfer",
        stateAfterFailure: "usage",
      };
    }

    case "retention":
      // Maintenance: rotate formats to keep retrieval fresh
      const total = learningState.productionHits + learningState.contextualHits;
      const formats: ReviewMode[] = ["production", "cloze", "audio_retrieval"];
      const pick = formats[total % formats.length];
      return {
        mode: pick,
        rationale: "Retention maintenance — rotating retrieval formats to prevent pattern matching.",
        stateAfterSuccess: "retention",
        stateAfterFailure: "retrieval", // demote on failure
      };

    default:
      return {
        mode: "production",
        rationale: "Default to production — the highest-value retrieval format.",
        stateAfterSuccess: "usage",
        stateAfterFailure: state,
      };
  }
}

/** Update learning state after a retrieval attempt. */
export function advanceState(
  current: ItemLearningState,
  format: RetrievalFormat,
  quality: 0 | 3 | 5,
  context: ModuleContext,
): ItemLearningState {
  const next = { ...current, achievedAt: { ...current.achievedAt } };
  const now = Date.now();

  // Track module context
  if (!next.contexts.includes(context)) {
    next.contexts = [...next.contexts, context];
  }

  // Track mode-specific stats
  if (format.mode === "production" || format.mode === "context_transfer") {
    if (quality >= 3) {
      next.productionHits++;
      next.lastProductionAt = now;
    } else {
      next.productionMisses++;
    }
  } else if (format.mode === "cloze" || format.mode === "audio_retrieval") {
    if (quality >= 3) {
      next.contextualHits++;
      next.lastContextualAt = now;
    } else {
      next.contextualMisses++;
    }
  }

  // Advance or demote state
  if (quality === 5) {
    next.state = format.stateAfterSuccess;
    if (!next.achievedAt[next.state]) {
      next.achievedAt[next.state] = now;
    }
  } else if (quality === 0) {
    // Hard failure demotes one level (but never below exposure)
    next.state = prevState(next.state);
  }
  // quality === 3 (partial) keeps current state

  return next;
}

/** Get the display label for a learning state. */
export function stateLabel(state: LearningState): { en: string; zh: string } {
  const labels: Record<LearningState, { en: string; zh: string }> = {
    exposure: { en: "Exposed", zh: "接触" },
    understanding: { en: "Understood", zh: "理解" },
    recognition: { en: "Recognized", zh: "辨认" },
    retrieval: { en: "Retrieved", zh: "提取" },
    usage: { en: "Used", zh: "使用" },
    transfer: { en: "Transferred", zh: "迁移" },
    retention: { en: "Retained", zh: "留存" },
  };
  return labels[state];
}

/** Compute a holistic strength score (0-100) from the full state record. */
export function holisticStrength(state: ItemLearningState): number {
  const stateIdx = STATE_INDEX[state.state];
  const base = (stateIdx / (LEARNING_STATES.length - 1)) * 60; // 0-60 from state
  const production = Math.min(25, state.productionHits * 5); // 0-25 from production
  const contextual = Math.min(15, state.contextualHits * 5); // 0-15 from contextual
  return Math.round(Math.min(100, base + production + contextual));
}
