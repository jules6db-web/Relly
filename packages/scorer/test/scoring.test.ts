import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  OpenAiCompatibleModel,
  PreviewRejectedError,
  ReferenceModel,
  WeightError,
  blend,
  buildBehavioralPreview,
  buildNounPreview,
  computeAuthorScore,
  createScoringModel,
  defaultWeights,
  rubricComponents,
  scoreCorpus,
  scoreDocument,
} from "../src/index.js";
import type { DocumentPreview, ScoreModel } from "../src/types.js";
import {
  CLOCK,
  allPreviews,
  behavior,
  comparisonCorpus,
  englishBenefits,
  frenchPayslip,
  longDwellMemo,
  neutralNote,
  payrollTopic,
  sessions,
  strongPayroll,
  stuffedPoll,
  thinNote,
} from "./miniCorpus.js";

const reference = new ReferenceModel();

function keysDeep(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      keysDeep(child, found);
    }
  }
  return found;
}

describe("reference scoring", () => {
  it("scores a strong payroll report well above a thin loonbrief note", async () => {
    const shared = {
      query: "loonbrief",
      corpus: comparisonCorpus,
      clock: CLOCK,
      behavior,
      model: reference,
      topics: [payrollTopic],
    };
    const strong = await scoreDocument({ preview: strongPayroll, ...shared });
    const thin = await scoreDocument({ preview: thinNote, ...shared });

    expect(strong.reliability.score).toBeGreaterThanOrEqual(thin.reliability.score + 0.25);
    expect(strong.relevance).not.toBeNull();
    expect(thin.relevance).not.toBeNull();
    expect(strong.relevance!.score).toBeGreaterThan(thin.relevance!.score);
  });

  it("lets a long dwell outrank a thin note on dwell and on blended relevance", async () => {
    const shared = {
      query: "loonbrief",
      corpus: comparisonCorpus,
      clock: CLOCK,
      behavior,
      model: reference,
    };
    const memo = await scoreDocument({ preview: longDwellMemo, ...shared });
    const thin = await scoreDocument({ preview: thinNote, ...shared });

    expect(memo.relevance!.components.dwell.rubricScore).toBeGreaterThan(
      thin.relevance!.components.dwell.rubricScore,
    );
    expect(memo.relevance!.score).toBeGreaterThan(thin.relevance!.score);
  });

  it("shrinks a stuffed poll and drops the author vote and a vote without useId", async () => {
    const missingUse = {
      respondentId: "no-use",
      rating: 5,
      respondentReliability: 0.8,
    };
    const preview: DocumentPreview = {
      ...stuffedPoll,
      poll: [...stuffedPoll.poll, missingUse as DocumentPreview["poll"][number]],
    };
    const rubric = rubricComponents(preview, { clock: CLOCK, corpus: [preview] });
    const scored = await scoreDocument({
      preview,
      clock: CLOCK,
      corpus: [preview],
      model: reference,
    });

    expect(rubric.reliability.poll).toBeLessThan(0.75);
    expect(scored.reliability.components.poll.rubricScore).toBeLessThan(0.75);
    expect(scored.label.poll.voteCount).toBe(11);
    expect(scored.label.poll.voteCount).toBe(rubric.details.poll.voteCount);
  });

  it("keeps a neutral document near 0.5 reliability", async () => {
    const scored = await scoreDocument({
      preview: neutralNote,
      clock: CLOCK,
      corpus: [neutralNote],
      model: reference,
    });
    expect(Math.abs(scored.reliability.score - 0.5)).toBeLessThanOrEqual(0.05);
  });

  it("gives the longer open the higher dwell score and ignores a 2000 ms glance", async () => {
    const glanceSessions = [
      {
        searchId: "dwell-pair",
        query: "loonbrief",
        language: "nl",
        opened: [
          { documentId: "long", dwellMs: 120_000 },
          { documentId: "medium", dwellMs: 30_000 },
          { documentId: "glance", dwellMs: 2_000 },
        ],
      },
    ];
    const dwellBehavior = buildBehavioralPreview(glanceSessions, { generatedAt: CLOCK });
    const row = dwellBehavior.terms.find((term) => term.term === "loonbrief");
    expect(row?.documents.map((document) => document.documentId)).not.toContain("glance");
    expect(row?.documents.find((document) => document.documentId === "long")?.dwellMs).toBeGreaterThan(
      row?.documents.find((document) => document.documentId === "medium")?.dwellMs ?? 0,
    );

    const nounPreview = { salient: [{ lemma: "loonbrief", count: 2 }], mentions: [] };
    const shared = {
      query: "loonbrief",
      clock: CLOCK,
      behavior: dwellBehavior,
      model: reference,
      corpus: [] as DocumentPreview[],
    };
    const long = await scoreDocument({
      ...shared,
      preview: previewWith("long", nounPreview),
    });
    const medium = await scoreDocument({
      ...shared,
      preview: previewWith("medium", nounPreview),
    });
    const glance = await scoreDocument({
      ...shared,
      preview: previewWith("glance", nounPreview),
    });

    expect(long.relevance!.components.dwell.rubricScore).toBeGreaterThan(
      medium.relevance!.components.dwell.rubricScore,
    );
    expect(glance.relevance!.components.dwell.rubricScore).toBe(0);
  });

  it("changes blended relevance when recency is the only weight and leaves components unchanged", async () => {
    const recent = previewWith("recent-note", { salient: [{ lemma: "loonbrief", count: 4 }], mentions: [] }, {
      createdAt: "2026-05-30T09:00:00.000Z",
    });
    const older = previewWith("older-note", { salient: [{ lemma: "loonbrief", count: 4 }], mentions: [] }, {
      createdAt: "2018-06-01T09:00:00.000Z",
    });
    const corpus = [recent, older];
    const shared = { query: "loonbrief", corpus, clock: CLOCK, model: reference };

    const recentDefault = await scoreDocument({ preview: recent, ...shared });
    const olderDefault = await scoreDocument({ preview: older, ...shared });
    const recentOnly = await scoreDocument({
      preview: recent,
      ...shared,
      weights: { relevance: { nouns: 0, dwell: 0, recency: 1 } },
    });
    const olderOnly = await scoreDocument({
      preview: older,
      ...shared,
      weights: { relevance: { nouns: 0, dwell: 0, recency: 1 } },
    });

    expect(recentOnly.relevance!.components).toEqual(recentDefault.relevance!.components);
    expect(olderOnly.relevance!.components).toEqual(olderDefault.relevance!.components);
    expect(recentOnly.relevance!.score).not.toBe(recentDefault.relevance!.score);
    expect(olderOnly.relevance!.score).not.toBe(olderDefault.relevance!.score);
    expect(recentOnly.relevance!.score).toBeGreaterThan(olderOnly.relevance!.score);
    expect(blend(recentOnly.relevance!.components, recentOnly.relevance!.weights)).toBe(
      recentOnly.relevance!.score,
    );
  });

  it("publishes the default reliability weights exactly", async () => {
    expect(defaultWeights.reliability).toEqual({
      author: 0.34,
      citations: 0.26,
      poll: 0.22,
      views: 0.08,
      date: 0.07,
      documentType: 0.03,
    });
    const scored = await scoreDocument({
      preview: neutralNote,
      clock: CLOCK,
      model: reference,
    });
    expect(scored.reliability.weights).toEqual(defaultWeights.reliability);
    expect(scored.relevance).toBeNull();
  });

  it("matches a French fiche de paie query without English nouns", async () => {
    const extracted = buildNounPreview(
      "La fiche de paie décrit la fiche de paie du personnel.",
      "fr",
    );
    expect(extracted.salient.map((noun) => noun.lemma)).toEqual(expect.arrayContaining(["fiche", "paie"]));
    expect(extracted.salient.map((noun) => noun.lemma)).not.toContain("payslip");

    const scored = await scoreDocument({
      preview: frenchPayslip,
      query: "fiche de paie",
      corpus: [frenchPayslip],
      clock: CLOCK,
      model: reference,
    });
    const terms = scored.relevance!.matchedNouns.map((noun) => noun.term);
    expect(terms).toEqual(expect.arrayContaining(["fiche", "paie"]));
    expect(terms).not.toContain("payslip");
    expect(scored.relevance!.components.nouns.rubricScore).toBeGreaterThan(0);
    expect(frenchPayslip.nounPreview.salient.map((noun) => noun.lemma)).toContain("fiche de paie");
  });

  it("ranks a payroll-heavy document above a benefits document on the payroll topic", async () => {
    const corpus = [strongPayroll, englishBenefits];
    const shared = {
      topics: [payrollTopic],
      corpus,
      clock: CLOCK,
      behavior,
      model: reference,
    };
    const payroll = await scoreDocument({ preview: strongPayroll, ...shared });
    const benefits = await scoreDocument({ preview: englishBenefits, ...shared });

    expect(payroll.relevance).toBeNull();
    expect(benefits.relevance).toBeNull();
    const payrollScore = payroll.topics.find((topic) => topic.topicId === "payroll")?.score;
    const benefitsScore = benefits.topics.find((topic) => topic.topicId === "payroll")?.score;
    expect(payrollScore).toBeDefined();
    expect(benefitsScore).toBeDefined();
    expect(payrollScore!).toBeGreaterThan(benefitsScore!);
  });

  it("rejects a model that moves a component by 0.9 and blends the reference score", async () => {
    const fake: ScoreModel = {
      id: "fake-plus-0.9",
      async score(request) {
        return {
          components: request.rubric.map((component) => ({
            key: component.key,
            rubricScore: component.rubricScore,
            aiScore: component.rubricScore + 0.9,
            explanation: "Moved far past the rubric.",
          })),
        };
      },
    };
    const shared = {
      preview: strongPayroll,
      query: "loonbrief",
      corpus: comparisonCorpus,
      clock: CLOCK,
      behavior,
    };
    const rejected = await scoreDocument({ ...shared, model: fake });
    const accepted = await scoreDocument({ ...shared, model: reference });

    expect(rejected.model).toBe("reference-fallback");
    expect(rejected.reliability.score).toBe(accepted.reliability.score);
    expect(rejected.relevance!.score).toBe(accepted.relevance!.score);
    for (const component of Object.values(rejected.reliability.components)) {
      expect(component.aiScore).toBe(component.rubricScore);
    }
    for (const component of Object.values(rejected.relevance!.components)) {
      expect(component.aiScore).toBe(component.rubricScore);
    }
  });

  it("does not call the model fetch for an oversized string or a text field", async () => {
    const fetchImpl = vi.fn();
    const model = new OpenAiCompatibleModel({
      apiKey: "test-key",
      baseUrl: "https://llm.example.test/v1",
      model: "unit-test",
      fetch: fetchImpl,
    });
    const longPreview: DocumentPreview = {
      ...neutralNote,
      id: "long-title",
      title: "x".repeat(501),
    };
    await expect(
      scoreDocument({ preview: longPreview, clock: CLOCK, model, query: "loonbrief" }),
    ).rejects.toBeInstanceOf(PreviewRejectedError);

    const rawText = { ...neutralNote, id: "raw-text", text: "full document body that must not be scored" };
    await expect(
      scoreDocument({
        preview: rawText as DocumentPreview,
        clock: CLOCK,
        model,
        query: "loonbrief",
      }),
    ).rejects.toBeInstanceOf(PreviewRejectedError);

    await expect(
      model.score({
        preview: rawText as DocumentPreview,
        rubric: [{ key: "author", rubricScore: 0.5 }],
        query: null,
        topic: null,
        behavior: [],
        explanationLanguage: "nl",
        responseSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
          required: ["components"],
        },
      }),
    ).rejects.toBeInstanceOf(PreviewRejectedError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns deep-equal corpus scores for two reference runs with the same clock", async () => {
    const input = {
      previews: allPreviews,
      topics: [payrollTopic],
      query: "loonbrief",
      clock: CLOCK,
      behavior,
      model: new ReferenceModel(),
    };
    const first = await scoreCorpus(input);
    const second = await scoreCorpus(input);
    expect(second).toEqual(first);
    expect(first.map((result) => result.documentId)).toEqual(allPreviews.map((preview) => preview.id));
  });

  it("has no ongoing or completed field on the result", async () => {
    const scored = await scoreDocument({
      preview: strongPayroll,
      query: "loonbrief",
      corpus: comparisonCorpus,
      clock: CLOCK,
      behavior,
      topics: [payrollTopic],
      model: reference,
    });
    const keys = keysDeep(scored);
    expect(keys).not.toContain("ongoing");
    expect(keys).not.toContain("completed");
    expect(scored).not.toHaveProperty("status");
    expect(Object.keys(scored).sort()).toEqual(
      ["documentId", "label", "model", "query", "relevance", "reliability", "topics"].sort(),
    );
  });
});

describe("weights, authors, and extractors", () => {
  it("rejects negative weights and an all-zero group", async () => {
    await expect(
      scoreDocument({
        preview: neutralNote,
        clock: CLOCK,
        model: reference,
        weights: { reliability: { author: -0.1 } },
      }),
    ).rejects.toBeInstanceOf(WeightError);
    await expect(
      scoreDocument({
        preview: neutralNote,
        clock: CLOCK,
        model: reference,
        weights: {
          relevance: { nouns: 0, dwell: 0, recency: 0 },
        },
        query: "loonbrief",
      }),
    ).rejects.toBeInstanceOf(WeightError);
  });

  it("shrinks a new author toward 0.5 and keeps the reliable-profile floor", () => {
    const fresh = computeAuthorScore(
      {
        id: "new",
        displayName: "New Author",
        expertise: 0.8,
        authorReliability: 0.2,
        reliableProfile: false,
      },
      [],
    );
    expect(fresh.track).toBeCloseTo(0.5);
    expect(fresh.combined).toBeCloseTo(0.65);

    const reliableNew = computeAuthorScore(
      {
        id: "new-reliable",
        displayName: "Reliable New",
        expertise: 0.8,
        authorReliability: 0.2,
        reliableProfile: true,
      },
      [],
    );
    expect(reliableNew.authorReliabilityUsed).toBeCloseTo(0.7);
    expect(reliableNew.combined).toBeCloseTo(0.75);

    const tracked = computeAuthorScore(
      {
        id: "tracked",
        displayName: "Tracked",
        expertise: 1,
        authorReliability: 0.4,
        reliableProfile: false,
      },
      [0.8, 0.6],
    );
    expect(tracked.track).toBeCloseTo(0.58);
    expect(tracked.combined).toBeCloseTo(0.79);
  });

  it("keeps generic nouns out of the salient set and accepts an unknown language", () => {
    const dutch = buildNounPreview("loonbrief loonbrief klant klant document", "nl");
    expect(dutch.salient.map((noun) => noun.lemma)).toContain("loonbrief");
    expect(dutch.salient.map((noun) => noun.lemma)).not.toContain("klant");
    expect(dutch.salient.map((noun) => noun.lemma)).not.toContain("document");
    expect(dutch.mentions.map((noun) => noun.lemma)).toEqual(expect.arrayContaining(["klant", "document"]));

    const generic = buildNounPreview("alpha alpha document document", "es");
    expect(generic.salient.map((noun) => noun.lemma)).toContain("alpha");
    expect(generic.salient.map((noun) => noun.lemma)).not.toContain("document");
  });

  it("uses the reference model when no API key is configured", () => {
    expect(createScoringModel({}).id).toBe("reference");
    expect(createScoringModel({ SCORING_LLM_API_KEY: "test" })).toBeInstanceOf(OpenAiCompatibleModel);
  });

  it("posts only the allowed JSON and never includes weights", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                components: [
                  { key: "author", rubricScore: 0.5, aiScore: 0.5, explanation: "" },
                ],
              }),
            },
          },
        ],
      }),
    }));
    const model = new OpenAiCompatibleModel({
      apiKey: "test-key",
      baseUrl: "https://llm.example.test/v1",
      model: "unit-test",
      fetch: fetchImpl,
    });
    await model.score({
      preview: neutralNote,
      rubric: [{ key: "author", rubricScore: 0.5 }],
      query: { text: "loonbrief", language: "nl" },
      topic: null,
      behavior: [],
      explanationLanguage: "nl",
      responseSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: ["components"],
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as {
      messages: { role: string; content: string }[];
    };
    const user = JSON.parse(body.messages.find((message) => message.role === "user")!.content) as Record<
      string,
      unknown
    >;
    expect(user).not.toHaveProperty("weights");
    expect(user).not.toHaveProperty("text");
    expect(user).toHaveProperty("preview");
    expect(user).toHaveProperty("rubric");
    expect(JSON.stringify(user)).not.toContain("\"weights\"");
  });
});

describe("score package boundaries", () => {
  it("does not read the filesystem or the network from src/score", () => {
    const root = join(process.cwd(), "src", "score");
    const files = walk(root).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const banned = /\b(fetch|XMLHttpRequest)\s*\(|from\s+["']node:(fs|http|https|net)|from\s+["']fs["']/;
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(banned);
    }
  });

  it("rebuilds the miniature dwell preview from sessions", () => {
    const rebuilt = buildBehavioralPreview(sessions, { generatedAt: CLOCK });
    expect(rebuilt).toEqual(behavior);
    expect(rebuilt.minDwellMs).toBe(3000);
    const loonbrief = rebuilt.terms.find((term) => term.term === "loonbrief");
    expect(loonbrief?.documents.map((document) => document.documentId)).not.toContain(thinNote.id);
  });
});

function previewWith(
  id: string,
  nounPreview: DocumentPreview["nounPreview"],
  extra: Partial<DocumentPreview> = {},
): DocumentPreview {
  return {
    id,
    title: id,
    language: "nl",
    createdAt: CLOCK,
    documentType: "unknown",
    viewCount: 1,
    nounPreview,
    citationDocumentIds: [],
    poll: [],
    author: {
      id: "author-unknown",
      expertise: 0.5,
      authorReliability: 0.5,
      reliableProfile: false,
      combined: 0.5,
    },
    ...extra,
  };
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
