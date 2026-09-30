import { round4, unitOrHalf } from "../number.js";
import { buildBehavioralPreview } from "../preview/behavior.js";
import { assertPreviewSafe, PreviewRejectedError } from "../preview/safety.js";
import type { ScoreModel, ModelScoreInput, ModelOutput, RubricRow } from "../model/types.js";
import { MODEL_RESPONSE_SCHEMA } from "../model/types.js";
import { ReferenceModel } from "../model/reference.js";
import type {
  BehavioralPreview,
  BehavioralTerm,
  Clock,
  ComponentJudgment,
  DocumentPreview,
  DocumentType,
  QueryInput,
  ScoreResult,
  SearchSession,
  TopicProfile,
  WeightOverrides,
} from "../types.js";
import { blend } from "./blend.js";
import { parseQuery, resolveClock, rubricComponents, type RubricBreakdown } from "./rubric.js";
import { resolveWeights } from "./weights.js";

const DOCUMENT_TYPES = new Set<DocumentType>([
  "primary_source",
  "peer_reviewed",
  "official_report",
  "dataset",
  "internal_memo",
  "draft",
  "unknown",
]);

type Accepted = {
  fallback: boolean;
  byKey: Map<string, { rubricScore: number; aiScore: number; explanation: string }>;
};

/** Cache key is preview + mode + rubric scores + model id. Weights are not included. */
const modelCache = new Map<string, Accepted>();

export type ScoreDocumentInput = {
  preview: DocumentPreview;
  query?: QueryInput | null;
  topics?: readonly TopicProfile[];
  corpus?: readonly DocumentPreview[];
  weights?: WeightOverrides;
  clock: Clock;
  model?: ScoreModel;
  behavior?: BehavioralPreview | null;
  sessions?: readonly SearchSession[];
};

export type ScoreCorpusInput = {
  previews: readonly DocumentPreview[];
  topics?: readonly TopicProfile[];
  query?: QueryInput | null;
  weights?: WeightOverrides;
  clock: Clock;
  model?: ScoreModel;
  behavior?: BehavioralPreview | null;
  sessions?: readonly SearchSession[];
};

export async function scoreDocument(input: ScoreDocumentInput): Promise<ScoreResult> {
  assertPreviewSafe(input.preview);
  const model = input.model ?? new ReferenceModel();
  const weights = resolveWeights(input.weights);
  const behavior = resolveBehavior(input.behavior, input.sessions, input.clock);
  const rubric = rubricComponents(input.preview, {
    clock: input.clock,
    corpus: input.corpus,
    query: input.query,
    behavior,
    topics: input.topics,
  });
  const parsed = parseQuery(input.query, input.preview.language);
  const explanationLanguage = parsed?.language || input.preview.language;
  let fallback = false;

  const reliabilityRows = reliabilityRubricRows(rubric);
  const relevanceRows = relevanceRubricRows(rubric);
  const queryJudged = parsed
    ? await judge(model, {
        preview: input.preview,
        rubric: [...relevanceRows, ...reliabilityRows],
        query: {
          text: parsed.text,
          ...(parsed.language ? { language: parsed.language } : {}),
        },
        topic: null,
        behavior: behaviorRows(behavior, parsed.terms),
        explanationLanguage,
        responseSchema: MODEL_RESPONSE_SCHEMA,
      })
    : null;
  if (queryJudged?.fallback) fallback = true;

  const reliabilityJudged =
    queryJudged ??
    (await judge(model, {
      preview: input.preview,
      rubric: reliabilityRows,
      query: null,
      topic: null,
      behavior: [],
      explanationLanguage,
      responseSchema: MODEL_RESPONSE_SCHEMA,
    }));
  if (reliabilityJudged.fallback) fallback = true;

  const reliability = {
    author: publish(reliabilityJudged, "author"),
    citations: publish(reliabilityJudged, "citations"),
    poll: publish(reliabilityJudged, "poll"),
    views: publish(reliabilityJudged, "views"),
    date: publish(reliabilityJudged, "date"),
    documentType: publish(reliabilityJudged, "documentType"),
  };

  const topicRows = [];
  for (const topic of rubric.topics) {
    const judged = await judge(model, {
      preview: input.preview,
      rubric: [
        { key: "nounAlignment", rubricScore: topic.nounAlignment },
        { key: "dwell", rubricScore: topic.dwell },
        { key: "recency", rubricScore: topic.recency },
      ],
      query: null,
      topic: { id: topic.topicId, nouns: topic.terms },
      behavior: behaviorRows(behavior, topic.terms),
      explanationLanguage,
      responseSchema: MODEL_RESPONSE_SCHEMA,
    });
    if (judged.fallback) fallback = true;
    const components = {
      nounAlignment: publish(judged, "nounAlignment"),
      dwell: publish(judged, "dwell"),
      recency: publish(judged, "recency"),
    };
    topicRows.push({
      topicId: topic.topicId,
      score: blend(components, weights.topic),
      weights: weights.topic,
      components,
    });
  }

  const relevance = rubric.relevance && queryJudged
    ? {
        nouns: publish(queryJudged, "nouns"),
        dwell: publish(queryJudged, "dwell"),
        recency: publish(queryJudged, "recency"),
      }
    : null;

  return {
    documentId: input.preview.id,
    model: fallback ? "reference-fallback" : model.id,
    query: parsed ? parsed.text : null,
    relevance: relevance
      ? {
          score: blend(relevance, weights.relevance),
          weights: weights.relevance,
          components: relevance,
          matchedNouns: rubric.relevance?.matchedNouns ?? [],
        }
      : null,
    reliability: {
      score: blend(reliability, weights.reliability),
      weights: weights.reliability,
      components: reliability,
    },
    topics: topicRows,
    label: buildLabel(input.preview, rubric, reliability.poll.rubricScore),
  };
}

export async function scoreCorpus(input: ScoreCorpusInput): Promise<ScoreResult[]> {
  const behavior = resolveBehavior(input.behavior, input.sessions, input.clock);
  const results: ScoreResult[] = [];
  for (const preview of input.previews) {
    results.push(
      await scoreDocument({
        preview,
        query: input.query,
        topics: input.topics,
        corpus: input.previews,
        weights: input.weights,
        clock: input.clock,
        model: input.model,
        behavior,
      }),
    );
  }
  return results;
}

function reliabilityRubricRows(rubric: RubricBreakdown): RubricRow[] {
  return [
    { key: "author", rubricScore: rubric.reliability.author },
    { key: "citations", rubricScore: rubric.reliability.citations },
    { key: "poll", rubricScore: rubric.reliability.poll },
    { key: "views", rubricScore: rubric.reliability.views },
    { key: "date", rubricScore: rubric.reliability.date },
    { key: "documentType", rubricScore: rubric.reliability.documentType },
  ];
}

function relevanceRubricRows(rubric: RubricBreakdown): RubricRow[] {
  if (!rubric.relevance) return [];
  return [
    { key: "nouns", rubricScore: rubric.relevance.nouns },
    { key: "dwell", rubricScore: rubric.relevance.dwell },
    { key: "recency", rubricScore: rubric.relevance.recency },
  ];
}

async function judge(model: ScoreModel, request: ModelScoreInput): Promise<Accepted> {
  assertPreviewSafe(request.preview);
  const key = cacheKey(model.id, request);
  const cached = modelCache.get(key);
  if (cached) return cached;

  let accepted: Accepted;
  try {
    const output = await model.score(request);
    accepted = acceptModelOutput(request, output);
  } catch (error) {
    if (error instanceof PreviewRejectedError) throw error;
    accepted = referenceOf(request, true);
  }
  modelCache.set(key, accepted);
  return accepted;
}

function acceptModelOutput(request: ModelScoreInput, output: ModelOutput): Accepted {
  if (!output || !Array.isArray(output.components)) return referenceOf(request, true);
  const expected = new Map(request.rubric.map((row) => [row.key, row.rubricScore]));
  if (output.components.length !== expected.size) return referenceOf(request, true);

  const byKey = new Map<string, { rubricScore: number; aiScore: number; explanation: string }>();
  const seen = new Set<string>();
  for (const component of output.components) {
    if (!component || typeof component.key !== "string" || seen.has(component.key)) {
      return referenceOf(request, true);
    }
    seen.add(component.key);
    const rubricScore = expected.get(component.key);
    if (rubricScore === undefined) return referenceOf(request, true);
    if (!isUnit(component.rubricScore) || !isUnit(component.aiScore)) return referenceOf(request, true);
    if (Math.abs(component.rubricScore - rubricScore) > 1e-4) return referenceOf(request, true);
    if (Math.abs(component.aiScore - rubricScore) > 0.15 + 1e-9) return referenceOf(request, true);
    if (typeof component.explanation !== "string" || component.explanation.length > 240) {
      return referenceOf(request, true);
    }
    const unchanged = Math.abs(component.aiScore - rubricScore) <= 1e-9;
    byKey.set(component.key, {
      rubricScore,
      aiScore: unchanged ? rubricScore : component.aiScore,
      explanation: unchanged ? "" : component.explanation,
    });
  }
  if (seen.size !== expected.size) return referenceOf(request, true);
  return { fallback: false, byKey };
}

function referenceOf(request: ModelScoreInput, fallback: boolean): Accepted {
  return {
    fallback,
    byKey: new Map(
      request.rubric.map((row) => [
        row.key,
        { rubricScore: row.rubricScore, aiScore: row.rubricScore, explanation: "" },
      ]),
    ),
  };
}

function publish(
  accepted: Accepted,
  key: string,
): ComponentJudgment {
  const value = accepted.byKey.get(key);
  if (!value) throw new Error(`Missing judged component ${key}`);
  const rubricScore = round4(value.rubricScore);
  const aiScore = round4(value.aiScore);
  return {
    rubricScore,
    aiScore,
    explanation: rubricScore === aiScore ? "" : value.explanation,
  };
}

function buildLabel(
  preview: DocumentPreview,
  rubric: RubricBreakdown,
  pollRubricScore: number,
): ScoreResult["label"] {
  const author = preview.author;
  const documentType = DOCUMENT_TYPES.has(preview.documentType) ? preview.documentType : "unknown";
  return {
    viewCount: Number.isFinite(preview.viewCount) ? Math.max(0, preview.viewCount) : 0,
    language: preview.language,
    author: {
      id: author.id,
      expertise: round4(unitOrHalf(author.expertise)),
      authorReliability: round4(unitOrHalf(author.authorReliability)),
      combined: round4(rubric.details.authorCombined),
      reliableProfile: author.reliableProfile === true,
    },
    documentType,
    createdAt: preview.createdAt,
    citations: {
      count: rubric.details.citations.count,
      inCorpus: rubric.details.citations.inCorpus,
      external: rubric.details.citations.external,
      meanAuthorCombined:
        rubric.details.citations.meanAuthorCombined === null
          ? null
          : round4(rubric.details.citations.meanAuthorCombined),
    },
    poll: {
      voteCount: rubric.details.poll.voteCount,
      rawMean: rubric.details.poll.rawMean === null ? null : round4(rubric.details.poll.rawMean),
      weightedScore: pollRubricScore,
      meanRespondentReliability:
        rubric.details.poll.meanRespondentReliability === null
          ? null
          : round4(rubric.details.poll.meanRespondentReliability),
    },
  };
}

function resolveBehavior(
  behavior: BehavioralPreview | null | undefined,
  sessions: readonly SearchSession[] | undefined,
  clock: Clock,
): BehavioralPreview | null {
  if (behavior) return behavior;
  if (!sessions) return null;
  return buildBehavioralPreview(sessions, {
    generatedAt: resolveClock(clock).toISOString(),
  });
}

function behaviorRows(
  behavior: BehavioralPreview | null,
  terms: readonly string[],
): BehavioralTerm[] {
  if (!behavior || terms.length === 0) return [];
  const wanted = new Set(terms);
  return behavior.terms.filter((term) => wanted.has(term.term));
}

function cacheKey(modelId: string, request: ModelScoreInput): string {
  return stable({
    modelId,
    preview: request.preview,
    query: request.query,
    topic: request.topic,
    rubric: request.rubric,
  });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort((a, b) => a[0].localeCompare(b[0]));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
