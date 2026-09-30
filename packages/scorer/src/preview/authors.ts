import { unitOrHalf } from "../number.js";
import type { AuthorProfile } from "../types.js";

export type AuthorScore = {
  expertise: number;
  baseReliability: number;
  sample: number;
  meanScore: number;
  track: number;
  authorReliabilityUsed: number;
  combined: number;
};

/**
 * Track-record author score used before a preview is saved.
 * A new author (no earlier documents) shrinks to 0.5 rather than 0.
 * Expertise is the stored profile value. This library does not infer it from text.
 */
export function computeAuthorScore(
  profile: Pick<AuthorProfile, "expertise" | "authorReliability" | "reliableProfile">,
  previousRubricReliabilities: readonly number[] = [],
): AuthorScore {
  const expertise = unitOrHalf(profile.expertise);
  const authorReliability = unitOrHalf(profile.authorReliability);
  const reliableProfile = profile.reliableProfile === true;
  const baseReliability = reliableProfile ? Math.max(authorReliability, 0.7) : authorReliability;
  const sample = previousRubricReliabilities.length;
  const meanScore =
    sample === 0
      ? baseReliability
      : previousRubricReliabilities.reduce((sum, score) => sum + unitOrHalf(score), 0) / sample;
  const track = (meanScore * sample + 0.5 * 3) / (sample + 3);
  const authorReliabilityUsed = reliableProfile ? Math.max(track, 0.7) : track;
  const combined = 0.5 * expertise + 0.5 * authorReliabilityUsed;
  return {
    expertise,
    baseReliability,
    sample,
    meanScore,
    track,
    authorReliabilityUsed,
    combined,
  };
}
