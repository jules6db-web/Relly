import type { BehavioralPreview, SearchSession } from "../types.js";
import { tokenize } from "./nouns.js";

export const MIN_DWELL_MS = 3000;

export type BehavioralOptions = {
  /** Required. The formula never reads the system clock. */
  generatedAt: string;
  minDwellMs?: number;
};

/**
 * Aggregate eligible opens into per-term dwell.
 * Opens shorter than minDwellMs (default 3000) are ignored.
 */
export function buildBehavioralPreview(
  sessions: readonly SearchSession[],
  options: BehavioralOptions,
): BehavioralPreview {
  if (!options.generatedAt) {
    throw new Error("generatedAt is required so the preview does not read the system clock");
  }
  const minDwellMs = options.minDwellMs ?? MIN_DWELL_MS;
  if (!Number.isFinite(minDwellMs) || minDwellMs < 0) {
    throw new Error("minDwellMs must be a non-negative number");
  }

  const totals = new Map<string, Map<string, number>>();
  for (const session of sessions) {
    const terms = [...new Set(tokenize(session.query, session.language))];
    if (terms.length === 0) continue;
    for (const opened of session.opened) {
      if (opened.dwellMs < minDwellMs) continue;
      for (const term of terms) {
        let documents = totals.get(term);
        if (!documents) {
          documents = new Map();
          totals.set(term, documents);
        }
        documents.set(opened.documentId, (documents.get(opened.documentId) ?? 0) + opened.dwellMs);
      }
    }
  }

  const terms = [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([term, documents]) => {
      const rows = [...documents.entries()]
        .map(([documentId, dwellMs]) => ({ documentId, dwellMs }))
        .sort((a, b) => a.documentId.localeCompare(b.documentId));
      const maxDwellMs = rows.reduce((max, row) => Math.max(max, row.dwellMs), 0);
      return { term, maxDwellMs, documents: rows };
    });

  return {
    generatedAt: options.generatedAt,
    minDwellMs,
    terms,
  };
}
