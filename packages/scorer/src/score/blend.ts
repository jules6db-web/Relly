import { round4 } from "../number.js";

/**
 * Weighted sum of AI component scores.
 * Component scores themselves do not change when weights change.
 * Published totals are clamped to [0, 1] and rounded to 4 decimal places.
 */
export function blend(
  components: Record<string, number | { aiScore: number }>,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      throw new Error(`Invalid weight for ${key}`);
    }
    const component = components[key];
    if (component === undefined) throw new Error(`Missing component: ${key}`);
    const score = typeof component === "number" ? component : component.aiScore;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new Error(`Invalid score for ${key}`);
    }
    total += weight * score;
  }
  const clamped = Math.min(1, Math.max(0, total));
  return round4(clamped);
}
