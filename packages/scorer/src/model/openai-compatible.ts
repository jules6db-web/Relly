import { assertPreviewSafe } from "../preview/safety.js";
import { ReferenceModel } from "./reference.js";
import type { ModelOutput, ModelScoreInput, ScoreModel } from "./types.js";

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type OpenAiCompatibleOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: FetchLike;
};

const SYSTEM_PROMPT = [
  "You score document components.",
  "You receive a document preview, a rubric breakdown, a query or a topic, and behavioral rows.",
  "You do not receive raw files, and you must not ask for them.",
  "Return JSON only, matching the response schema.",
  "For each rubric row, set aiScore within 0.15 of rubricScore and inside [0, 1].",
  "explanation is one sentence in explanationLanguage, at most 240 characters.",
  "Leave explanation empty when aiScore equals rubricScore.",
  "Do not output a weighted total.",
].join(" ");

/**
 * Posts the allowed JSON to an OpenAI-compatible chat endpoint.
 * Construct this only when an API key is configured. Otherwise use createScoringModel.
 */
export class OpenAiCompatibleModel implements ScoreModel {
  readonly id: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiCompatibleOptions) {
    if (!options.apiKey) throw new Error("SCORING_LLM_API_KEY is required");
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.id = options.model;
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
  }

  async score(input: ModelScoreInput): Promise<ModelOutput> {
    assertPreviewSafe(input.preview);
    const payload = {
      preview: input.preview,
      rubric: input.rubric,
      query: input.query,
      topic: input.topic,
      behavior: input.behavior,
      explanationLanguage: input.explanationLanguage,
      responseSchema: input.responseSchema,
    };
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.id,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Model request failed with status ${response.status}`);
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Model response did not include JSON content");
    return parseModelJson(content);
  }
}

export type ScoringEnv = {
  SCORING_LLM_API_KEY?: string | undefined;
  SCORING_LLM_BASE_URL?: string | undefined;
  SCORING_LLM_MODEL?: string | undefined;
};

/** Uses the reference model when SCORING_LLM_API_KEY is absent. */
export function createScoringModel(env: ScoringEnv = process.env): ScoreModel {
  const apiKey = env.SCORING_LLM_API_KEY;
  if (!apiKey) return new ReferenceModel();
  return new OpenAiCompatibleModel({
    apiKey,
    baseUrl: env.SCORING_LLM_BASE_URL || "https://api.openai.com/v1",
    model: env.SCORING_LLM_MODEL || "gpt-4o-mini",
  });
}

function parseModelJson(content: string): ModelOutput {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced?.[1] ?? trimmed) as ModelOutput;
  return parsed;
}
