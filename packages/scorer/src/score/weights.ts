import type {
  ReliabilityWeights,
  RelevanceWeights,
  TopicWeights,
  WeightOverrides,
  WeightSet,
} from "../types.js";

export class WeightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeightError";
  }
}

export const defaultWeights: WeightSet = Object.freeze({
  relevance: Object.freeze({
    nouns: 0.55,
    dwell: 0.38,
    recency: 0.07,
  }),
  reliability: Object.freeze({
    author: 0.34,
    citations: 0.26,
    poll: 0.22,
    views: 0.08,
    date: 0.07,
    documentType: 0.03,
  }),
  topic: Object.freeze({
    nounAlignment: 0.7,
    dwell: 0.25,
    recency: 0.05,
  }),
});

export function resolveWeights(overrides?: WeightOverrides): WeightSet {
  return {
    relevance: normalizeGroup(defaultWeights.relevance, overrides?.relevance),
    reliability: normalizeGroup(defaultWeights.reliability, overrides?.reliability),
    topic: normalizeGroup(defaultWeights.topic, overrides?.topic),
  };
}

function normalizeGroup<T extends Record<string, number>>(defaults: T, overrides?: Partial<T>): T {
  const merged: Record<string, number> = { ...defaults };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || !(key in defaults)) continue;
      merged[key] = value;
    }
  }

  const entries = Object.entries(merged);
  for (const [key, value] of entries) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new WeightError(`Weight "${key}" must be a finite number`);
    }
    if (value < 0) throw new WeightError(`Negative weights are rejected (${key})`);
  }

  const sum = entries.reduce((total, [, value]) => total + value, 0);
  if (sum === 0) throw new WeightError("Every weight in a group is 0");

  const unchanged = entries.every(([key, value]) => value === defaults[key]);
  if (unchanged) return { ...defaults };

  const normalized: Record<string, number> = {};
  for (const [key, value] of entries) normalized[key] = value / sum;
  return normalized as T;
}

export type { RelevanceWeights, ReliabilityWeights, TopicWeights };
