import type { DocumentPreview } from "../types.js";

export const FORBIDDEN_PREVIEW_KEYS = new Set([
  "text",
  "body",
  "content",
  "file",
  "bytes",
  "html",
  "pdf",
]);

export const MAX_PREVIEW_STRING_LENGTH = 500;

export class PreviewRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewRejectedError";
  }
}

/** Reject previews that carry raw text or any string longer than 500 characters. */
export function assertPreviewSafe(preview: DocumentPreview): void {
  const violation = findPreviewViolation(preview);
  if (violation) throw new PreviewRejectedError(violation);
}

export function findPreviewViolation(value: unknown): string | null {
  return walk(value, new Set());
}

function walk(value: unknown, seen: Set<object>): string | null {
  if (typeof value === "string") {
    if (value.length > MAX_PREVIEW_STRING_LENGTH) {
      return `preview string is longer than ${MAX_PREVIEW_STRING_LENGTH} characters`;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const violation = walk(item, seen);
      if (violation) return violation;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PREVIEW_KEYS.has(key)) {
      return `preview contains forbidden key "${key}"`;
    }
    const violation = walk(child, seen);
    if (violation) return violation;
  }
  return null;
}
