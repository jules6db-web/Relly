import { clamp01, unitOrHalf } from "../number.js";
import { tokenize } from "../preview/nouns.js";
import type {
  BehavioralPreview,
  Clock,
  DocumentPreview,
  DocumentType,
  MatchedNoun,
  QueryInput,
  TopicProfile,
} from "../types.js";

const K1 = 1.2;
const B = 0.75;
const LEXICAL_SCALE = 1.5;
const DOCUMENT_TYPES = new Set<DocumentType>([
  "primary_source",
  "peer_reviewed",
  "official_report",
  "dataset",
  "internal_memo",
  "draft",
  "unknown",
]);

const TYPE_PRIOR: Record<DocumentType, number> = {
  primary_source: 0.9,
  peer_reviewed: 0.85,
  official_report: 0.8,
  dataset: 0.75,
  internal_memo: 0.55,
  draft: 0.35,
  unknown: 0.5,
};

export type RubricContext = {
  clock: Clock;
  corpus?: readonly DocumentPreview[];
  query?: QueryInput | null;
  behavior?: BehavioralPreview | null;
  topics?: readonly TopicProfile[];
};

export type RubricBreakdown = {
  reliability: {
    author: number;
    citations: number;
    poll: number;
    views: number;
    date: number;
    documentType: number;
  };
  relevance: null | {
    nouns: number;
    dwell: number;
    recency: number;
    matchedNouns: MatchedNoun[];
  };
  topics: {
    topicId: string;
    nounAlignment: number;
    dwell: number;
    recency: number;
    /** Noun keys in play for this topic. Not part of the public score result. */
    terms: string[];
  }[];
  details: {
    ageDays: number;
    authorCombined: number;
    poll: {
      voteCount: number;
      rawMean: number | null;
      weightedScore: number;
      meanRespondentReliability: number | null;
    };
    citations: {
      count: number;
      inCorpus: number;
      external: number;
      meanAuthorCombined: number | null;
    };
  };
};

type TermCounts = Map<string, { salient: number; mention: number }>;

type CorpusStats = {
  documents: DocumentPreview[];
  n: number;
  avgdl: number;
  df: Map<string, number>;
  lengths: Map<string, number>;
  terms: Map<string, TermCounts>;
  authors: Map<string, number>;
};

export function rubricComponents(preview: DocumentPreview, context: RubricContext): RubricBreakdown {
  const clock = resolveClock(context.clock);
  const ageDays = ageInDays(preview.createdAt, clock);
  const stats = corpusStats(preview, context.corpus);
  const authorCombined = authorComponent(preview);
  const citations = citationComponent(preview, stats.authors);
  const poll = pollComponent(preview);
  const views = viewComponent(preview.viewCount);
  const date = dateReliability(ageDays);
  const documentType = TYPE_PRIOR[normalizeDocumentType(preview.documentType)];
  const recency = recencyScore(ageDays);
  const parsedQuery = parseQuery(context.query, preview.language);

  const relevance = parsedQuery
    ? {
        ...lexicalAndDwell(parsedQuery.terms, preview, stats, context.behavior ?? null),
        recency,
      }
    : null;

  const topics = [];
  for (const topic of context.topics ?? []) {
    const alignmentTerms = topicAlignmentTerms(topic, preview, stats);
    const dwellTerms = topicDwellTerms(topic);
    const nounAlignment = lexicalScore(alignmentTerms, preview, stats).score;
    const dwell = dwellScore(dwellTerms, preview.id, context.behavior ?? null);
    if (nounAlignment <= 1e-12 && dwell <= 1e-12) continue;
    topics.push({
      topicId: topic.id,
      nounAlignment,
      dwell,
      recency,
      terms: unique([...alignmentTerms, ...dwellTerms]),
    });
  }

  return {
    reliability: {
      author: authorCombined,
      citations: citations.score,
      poll: poll.weightedScore,
      views,
      date,
      documentType,
    },
    relevance: relevance
      ? {
          nouns: relevance.score,
          dwell: relevance.dwell,
          recency: relevance.recency,
          matchedNouns: relevance.matchedNouns,
        }
      : null,
    topics,
    details: {
      ageDays,
      authorCombined,
      poll,
      citations: citations.label,
    },
  };
}

export function resolveClock(clock: Clock): Date {
  const value = typeof clock === "function" ? clock() : clock;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid clock");
  return date;
}

export function ageInDays(createdAt: string, clock: Date): number {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) throw new Error(`Invalid createdAt: ${createdAt}`);
  const days = (clock.getTime() - created.getTime()) / 86_400_000;
  return Math.max(0, days);
}

export function recencyScore(ageDays: number): number {
  return Math.exp(-ageDays / 730);
}

export function dateReliability(ageDays: number): number {
  return 0.8 + 0.2 * Math.exp(-ageDays / 1825);
}

export function viewComponent(viewCount: number): number {
  const views = Number.isFinite(viewCount) ? Math.max(0, viewCount) : 0;
  return Math.min(1, Math.log(1 + views) / Math.log(1 + 1000));
}

function authorComponent(preview: DocumentPreview): number {
  const author = preview.author;
  if (!author || typeof author.combined !== "number" || !Number.isFinite(author.combined)) {
    const expertise = unitOrHalf(author?.expertise);
    const reliability = unitOrHalf(author?.authorReliability);
    const base = author?.reliableProfile ? Math.max(reliability, 0.7) : reliability;
    return 0.5 * expertise + 0.5 * base;
  }
  return clamp01(author.combined);
}

function citationComponent(
  preview: DocumentPreview,
  authors: Map<string, number>,
): {
  score: number;
  label: RubricBreakdown["details"]["citations"];
} {
  const ids = preview.citationDocumentIds ?? [];
  const n = ids.length;
  if (n === 0) {
    return {
      score: 0.35,
      label: { count: 0, inCorpus: 0, external: 0, meanAuthorCombined: null },
    };
  }
  let qualitySum = 0;
  let inCorpus = 0;
  for (const id of ids) {
    const known = authors.get(id);
    if (known === undefined) qualitySum += 0.5;
    else {
      qualitySum += known;
      inCorpus += 1;
    }
  }
  const quality = qualitySum / n;
  const countScore = Math.min(1, Math.log(1 + n) / Math.log(1 + 20));
  return {
    score: 0.4 * countScore + 0.6 * quality,
    label: {
      count: n,
      inCorpus,
      external: n - inCorpus,
      meanAuthorCombined: quality,
    },
  };
}

function pollComponent(preview: DocumentPreview): RubricBreakdown["details"]["poll"] {
  const authorId = preview.author?.id;
  const valid = (preview.poll ?? []).filter((vote) => {
    if (!vote) return false;
    if (typeof vote.rating !== "number" || vote.rating < 1 || vote.rating > 5) return false;
    if (
      typeof vote.respondentReliability !== "number" ||
      vote.respondentReliability < 0 ||
      vote.respondentReliability > 1
    ) {
      return false;
    }
    if (typeof vote.useId !== "string" || vote.useId.length === 0) return false;
    if (typeof vote.respondentId !== "string" || vote.respondentId.length === 0) return false;
    if (vote.respondentId === authorId) return false;
    return true;
  });

  if (valid.length === 0) {
    return {
      voteCount: 0,
      rawMean: null,
      weightedScore: 0.5,
      meanRespondentReliability: null,
    };
  }

  let weighted = 0;
  let reliabilitySum = 0;
  let mappedSum = 0;
  for (const vote of valid) {
    const mapped = (vote.rating - 1) / 4;
    weighted += vote.respondentReliability * mapped;
    reliabilitySum += vote.respondentReliability;
    mappedSum += mapped;
  }
  const k = 5;
  const prior = 0.5;
  return {
    voteCount: valid.length,
    rawMean: mappedSum / valid.length,
    weightedScore: (weighted + k * prior) / (reliabilitySum + k),
    meanRespondentReliability: reliabilitySum / valid.length,
  };
}

function lexicalAndDwell(
  terms: string[],
  preview: DocumentPreview,
  stats: CorpusStats,
  behavior: BehavioralPreview | null,
): { score: number; dwell: number; matchedNouns: MatchedNoun[] } {
  const lexical = lexicalScore(terms, preview, stats);
  return {
    score: lexical.score,
    dwell: dwellScore(terms, preview.id, behavior),
    matchedNouns: lexical.matchedNouns,
  };
}

function lexicalScore(
  terms: string[],
  preview: DocumentPreview,
  stats: CorpusStats,
): { score: number; matchedNouns: MatchedNoun[] } {
  const counts = stats.terms.get(preview.id) ?? new Map();
  const dl = stats.lengths.get(preview.id) ?? 1;
  let bm25Sum = 0;
  const matchedNouns: MatchedNoun[] = [];
  for (const term of terms) {
    const row = counts.get(term);
    const salientCount = row?.salient ?? 0;
    const mentionCount = row?.mention ?? 0;
    const tf = salientCount + 0.5 * mentionCount;
    if (tf <= 0) {
      continue;
    }
    const df = stats.df.get(term) ?? 0;
    const idf = Math.log(1 + (stats.n - df + 0.5) / (df + 0.5));
    const denom = tf + K1 * (1 - B + B * (dl / stats.avgdl));
    bm25Sum += (idf * (tf * (K1 + 1))) / denom;
    matchedNouns.push({ term, salientCount, mentionCount });
  }
  return {
    score: bm25Sum / (bm25Sum + LEXICAL_SCALE),
    matchedNouns,
  };
}

export function dwellScore(
  terms: readonly string[],
  documentId: string,
  behavior: BehavioralPreview | null,
): number {
  if (!behavior || terms.length === 0) return 0;
  const byTerm = new Map(behavior.terms.map((term) => [term.term, term]));
  const scores: number[] = [];
  for (const term of terms) {
    const row = byTerm.get(term);
    if (!row || row.maxDwellMs <= 0) continue;
    const open = row.documents.find((document) => document.documentId === documentId);
    const dwellMs = open?.dwellMs ?? 0;
    const ratio = dwellMs / row.maxDwellMs;
    const support = 1 - Math.exp(-row.maxDwellMs / 60_000);
    scores.push(ratio * support);
  }
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function topicAlignmentTerms(
  topic: TopicProfile,
  preview: DocumentPreview,
  stats: CorpusStats,
): string[] {
  const lang = primarySubtag(preview.language);
  const base = topic.nouns[lang] ?? topic.nouns[preview.language] ?? [];
  const terms = unique(base.flatMap((noun) => tokenize(noun, lang)));
  const present = stats.terms.get(preview.id) ?? new Map();
  for (const [listLang, nouns] of Object.entries(topic.nouns)) {
    if (primarySubtag(listLang) === lang) continue;
    for (const noun of nouns) {
      for (const token of tokenize(noun, listLang)) {
        const row = present.get(token);
        if (row && row.salient + row.mention > 0) terms.push(token);
      }
    }
  }
  return unique(terms);
}

function topicDwellTerms(topic: TopicProfile): string[] {
  const terms: string[] = [];
  for (const [language, nouns] of Object.entries(topic.nouns)) {
    for (const noun of nouns) terms.push(...tokenize(noun, language));
  }
  return unique(terms);
}

export function parseQuery(
  query: QueryInput | null | undefined,
  documentLanguage: string,
): { text: string; language?: string; terms: string[] } | null {
  if (query == null) return null;
  if (typeof query === "string") {
    return {
      text: query,
      terms: unique(tokenize(query, documentLanguage)),
    };
  }
  const language = query.language ?? documentLanguage;
  return {
    text: query.text,
    language: query.language,
    terms: unique(tokenize(query.text, language)),
  };
}

function corpusStats(preview: DocumentPreview, corpus: readonly DocumentPreview[] | undefined): CorpusStats {
  const documents = [...(corpus ?? [])];
  if (!documents.some((document) => document.id === preview.id)) documents.push(preview);
  const terms = new Map<string, TermCounts>();
  const lengths = new Map<string, number>();
  const df = new Map<string, number>();
  const authors = new Map<string, number>();
  let lengthSum = 0;
  for (const document of documents) {
    const counts = termCounts(document);
    terms.set(document.id, counts);
    const length = documentLength(document);
    lengths.set(document.id, length);
    lengthSum += length;
    for (const term of counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    authors.set(document.id, authorComponent(document));
  }
  const n = documents.length;
  const avgdl = Math.max(1, n === 0 ? 1 : lengthSum / n);
  return { documents, n: Math.max(1, n), avgdl, df, lengths, terms, authors };
}

export function termCounts(preview: DocumentPreview): TermCounts {
  const map: TermCounts = new Map();
  const lang = primarySubtag(preview.language);
  const add = (lemma: string, field: "salient" | "mention", count: number) => {
    if (!Number.isFinite(count) || count <= 0) return;
    const tokens = unique(tokenize(lemma, lang));
    const keys = tokens.length > 0 ? tokens : [lemma.normalize("NFKC").toLowerCase()];
    for (const key of keys) {
      const current = map.get(key) ?? { salient: 0, mention: 0 };
      current[field] += count;
      map.set(key, current);
    }
  };
  for (const noun of preview.nounPreview?.salient ?? []) add(noun.lemma, "salient", noun.count);
  for (const noun of preview.nounPreview?.mentions ?? []) add(noun.lemma, "mention", noun.count);
  return map;
}

function documentLength(preview: DocumentPreview): number {
  const sum = (preview.nounPreview?.salient ?? []).reduce((total, noun) => {
    return total + (Number.isFinite(noun.count) ? Math.max(0, noun.count) : 0);
  }, 0);
  return Math.max(1, sum);
}

function normalizeDocumentType(value: string): DocumentType {
  return DOCUMENT_TYPES.has(value as DocumentType) ? (value as DocumentType) : "unknown";
}

function primarySubtag(language: string): string {
  return language.trim().toLowerCase().split("-")[0] ?? "";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
