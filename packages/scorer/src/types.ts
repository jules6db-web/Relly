/**
 * Schema version the fixture repository must publish in manifest.json.
 * Version 1 is the preview, session, topic, and behavioral shapes below.
 */
export const SCHEMA_VERSION = 1;

export type DocumentType =
  | "primary_source"
  | "peer_reviewed"
  | "official_report"
  | "dataset"
  | "internal_memo"
  | "draft"
  | "unknown";

export type NounCount = {
  lemma: string;
  count: number;
};

export type NounPreview = {
  salient: NounCount[];
  mentions: NounCount[];
};

export type PollVote = {
  useId: string;
  respondentId: string;
  rating: number;
  respondentReliability: number;
};

export type PreviewAuthor = {
  id: string;
  expertise: number;
  authorReliability: number;
  reliableProfile: boolean;
  combined: number;
};

export type DocumentPreview = {
  id: string;
  /** Label only, max 200 characters. Not a scoring input. */
  title: string;
  /** BCP 47, for example "nl", "fr", "en", "de". */
  language: string;
  /** ISO-8601 creation time. */
  createdAt: string;
  documentType: DocumentType;
  viewCount: number;
  nounPreview: NounPreview;
  citationDocumentIds: string[];
  poll: PollVote[];
  author: PreviewAuthor;
};

export type AuthorProfile = {
  id: string;
  displayName: string;
  expertise: number;
  authorReliability: number;
  reliableProfile: boolean;
};

export type TopicProfile = {
  id: string;
  /** Language code to the lemmas that matter for the topic. */
  nouns: Record<string, string[]>;
};

export type SearchSession = {
  searchId: string;
  query: string;
  language: string;
  opened: { documentId: string; dwellMs: number }[];
};

export type BehavioralTerm = {
  term: string;
  maxDwellMs: number;
  documents: { documentId: string; dwellMs: number }[];
};

export type BehavioralPreview = {
  generatedAt: string;
  minDwellMs: number;
  terms: BehavioralTerm[];
};

export type QueryInput = string | { text: string; language?: string };

/** Injected clock. Scoring formulas never read the system clock. */
export type Clock = Date | string | (() => Date | string);

export type RelevanceWeights = {
  nouns: number;
  dwell: number;
  recency: number;
};

export type ReliabilityWeights = {
  author: number;
  citations: number;
  poll: number;
  views: number;
  date: number;
  documentType: number;
};

export type TopicWeights = {
  nounAlignment: number;
  dwell: number;
  recency: number;
};

export type WeightSet = {
  relevance: RelevanceWeights;
  reliability: ReliabilityWeights;
  topic: TopicWeights;
};

export type WeightOverrides = {
  relevance?: Partial<RelevanceWeights>;
  reliability?: Partial<ReliabilityWeights>;
  topic?: Partial<TopicWeights>;
};

export type ComponentJudgment = {
  rubricScore: number;
  aiScore: number;
  explanation: string;
};

export type MatchedNoun = {
  term: string;
  salientCount: number;
  mentionCount: number;
};

export type ScoreResult = {
  documentId: string;
  /** "reference", the configured model id, or "reference-fallback". */
  model: string;
  query: string | null;
  relevance: null | {
    score: number;
    weights: RelevanceWeights;
    components: {
      nouns: ComponentJudgment;
      dwell: ComponentJudgment;
      recency: ComponentJudgment;
    };
    matchedNouns: MatchedNoun[];
  };
  reliability: {
    score: number;
    weights: ReliabilityWeights;
    components: {
      author: ComponentJudgment;
      citations: ComponentJudgment;
      poll: ComponentJudgment;
      views: ComponentJudgment;
      date: ComponentJudgment;
      documentType: ComponentJudgment;
    };
  };
  topics: {
    topicId: string;
    score: number;
    weights: TopicWeights;
    components: {
      nounAlignment: ComponentJudgment;
      dwell: ComponentJudgment;
      recency: ComponentJudgment;
    };
  }[];
  label: {
    viewCount: number;
    language: string;
    author: {
      id: string;
      expertise: number;
      authorReliability: number;
      combined: number;
      reliableProfile: boolean;
    };
    documentType: DocumentType;
    createdAt: string;
    citations: {
      count: number;
      inCorpus: number;
      external: number;
      meanAuthorCombined: number | null;
    };
    poll: {
      voteCount: number;
      rawMean: number | null;
      weightedScore: number;
      meanRespondentReliability: number | null;
    };
  };
};
