export { SCHEMA_VERSION } from "./types.js";
export type {
  AuthorProfile,
  BehavioralPreview,
  BehavioralTerm,
  Clock,
  ComponentJudgment,
  DocumentPreview,
  DocumentType,
  MatchedNoun,
  NounCount,
  NounPreview,
  PollVote,
  PreviewAuthor,
  QueryInput,
  RelevanceWeights,
  ReliabilityWeights,
  ScoreResult,
  SearchSession,
  TopicProfile,
  TopicWeights,
  WeightOverrides,
  WeightSet,
} from "./types.js";

export { buildNounPreview, tokenize, primaryLanguage } from "./preview/nouns.js";
export type { NounPreviewOptions } from "./preview/nouns.js";
export { buildBehavioralPreview, MIN_DWELL_MS } from "./preview/behavior.js";
export type { BehavioralOptions } from "./preview/behavior.js";
export { computeAuthorScore } from "./preview/authors.js";
export type { AuthorScore } from "./preview/authors.js";
export { PreviewRejectedError } from "./preview/safety.js";

export { rubricComponents } from "./score/rubric.js";
export type { RubricBreakdown, RubricContext } from "./score/rubric.js";
export { blend } from "./score/blend.js";
export { defaultWeights, resolveWeights, WeightError } from "./score/weights.js";
export { scoreDocument, scoreCorpus } from "./score/corpus.js";
export type { ScoreCorpusInput, ScoreDocumentInput } from "./score/corpus.js";

export { ReferenceModel } from "./model/reference.js";
export { OpenAiCompatibleModel, createScoringModel } from "./model/openai-compatible.js";
export type { ModelComponent, ModelOutput, ModelScoreInput, ScoreModel } from "./model/types.js";
