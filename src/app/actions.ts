/* Thin compatibility layer (step-11): every action moved to its domain
 * module under ./actions/ — the exports below resolve to the SAME function
 * objects, so existing imports (UI, scripts, tests) are untouched.
 * Deliberately NOT marked "use server": Turbopack only allows async-function
 * exports in such files (no re-exports at all). The domain modules each
 * carry "use server", which is what makes these actions callable from
 * client components. */

export {
  setExamProfileAction,
  setImmersionLevelAction,
  setDailyMinutesAction,
  setLearningLevelAction,
  setTargetBandAction,
  quickStartAction,
  onboardAction,
  updateProfileAction,
} from "./actions/profile";

export {
  recordExposureAction,
  markStepAction,
  toggleLiteAction,
  logEventAction,
  logExternalSessionAction,
  getExternalSessionsAction,
  registerPatternAction,
  saveMissAction,
  saveShadowAction,
  attachTranscriptAction,
} from "./actions/learning";

export { assessDifficultyAction, importContentAction } from "./actions/import";

export {
  saveCorpusChunkAction,
  saveCustomChunkAction,
  saveVocabAction,
  saveSentenceAction,
  addErrorAction,
  toggleErrorAction,
} from "./actions/bank";

export {
  saveWritingAction,
  saveWritingRevisionAction,
  saveSpeakingAction,
} from "./actions/attempts";

export {
  saveAIProviderConfigAction,
  clearAIProviderConfigAction,
  addWordTargetAction,
  testAIProviderConfigAction,
} from "./actions/ai-settings";
