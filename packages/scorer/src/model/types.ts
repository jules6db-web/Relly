import type { BehavioralTerm, DocumentPreview } from "../types.js";

export type RubricRow = {
  key: string;
  rubricScore: number;
};

export type ModelComponent = {
  key: string;
  rubricScore: number;
  aiScore: number;
  explanation: string;
};

export type ModelOutput = {
  components: ModelComponent[];
};

export type ModelScoreInput = {
  preview: DocumentPreview;
  rubric: RubricRow[];
  query: { text: string; language?: string } | null;
  topic: { id: string; nouns: string[] } | null;
  behavior: BehavioralTerm[];
  explanationLanguage: string;
  responseSchema: typeof MODEL_RESPONSE_SCHEMA;
};

export const MODEL_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          rubricScore: { type: "number", minimum: 0, maximum: 1 },
          aiScore: { type: "number", minimum: 0, maximum: 1 },
          explanation: { type: "string", maxLength: 240 },
        },
        required: ["key", "rubricScore", "aiScore", "explanation"],
      },
    },
  },
  required: ["components"],
} as const;

export interface ScoreModel {
  readonly id: string;
  score(input: ModelScoreInput): Promise<ModelOutput>;
}
