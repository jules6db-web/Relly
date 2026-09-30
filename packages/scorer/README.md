# Document scoring

A TypeScript library that scores fictional customer-file **previews**. It is not an official SD Worx product and it does not read raw documents.

Two scores are produced for search, plus a standing topic score:

- **Query relevance** answers “how well does this preview match the words just typed?” It blends salient nouns, time spent open after searches for those words, and a gentle recency curve.
- **Reliability** answers “how much should a reader trust this preview?” It blends the author’s stored expertise and reliability, citation strength, a small post-use poll, and gentle effects from view count, creation date, and document type.
- **Standing topic score** is stable for a document and a topic until the preview or the model version changes. It uses the topic’s noun keys, dwell after searches for those nouns, and the same recency curve. A topic with no noun overlap and no dwell is omitted.

People can raise or lower any weight at search time. Component scores stay as they are. Moving a weight recomputes the blend locally and does not call the model again.

```ts
import { blend, resolveWeights } from "document-scoring";

const weights = resolveWeights({
  relevance: { nouns: 0.2, dwell: 0.2, recency: 0.6 },
});
const nextRelevance = blend(result.relevance.components, weights.relevance);
```

`resolveWeights` rejects negative weights, then renormalizes each group so it sums to 1. If every weight in a group is 0, the request is rejected.

## The model never sees raw files

Extractors and the rubric are hardcoded. The model receives only the document preview, the rubric breakdown, the query or topic noun keys, the behavioral rows for the terms in play, and the response schema. It does not receive weights, file paths, or document bytes.

A preview is rejected before any model call when a string is longer than 500 characters, or when it contains a forbidden key: `text`, `body`, `content`, `file`, `bytes`, `html`, or `pdf`.

The model may move a component at most 0.15 away from the rubric value, inside `[0, 1]`. If the response is missing a key, a number is outside that range, or an AI score is more than 0.15 from the rubric, that request is discarded and the reference model is used (`model: "reference-fallback"`).

`ReferenceModel` sets every `aiScore` equal to the rubric value and leaves the explanation empty. It is the default. Tests use it only.

An OpenAI-compatible adapter is optional. It reads `SCORING_LLM_BASE_URL`, `SCORING_LLM_API_KEY`, and `SCORING_LLM_MODEL`. When the API key is absent, `createScoringModel()` returns the reference model. No key is required to run the tests.

## Default weights

Each group sums to 1.

| Query relevance | Default |
| --- | --- |
| nouns | 0.55 |
| dwell | 0.38 |
| recency | 0.07 |

| Reliability | Default |
| --- | --- |
| author | 0.34 |
| citations | 0.26 |
| poll | 0.22 |
| views | 0.08 |
| date | 0.07 |
| documentType | 0.03 |

| Standing topic | Default |
| --- | --- |
| nounAlignment | 0.70 |
| dwell | 0.25 |
| recency | 0.05 |

Date, views, and document type start small. Callers can still raise them, including setting a weight to zero, and the component stays visible. Whether a document is ongoing or completed is not stored, scored, or returned.

## Schema version

`SCHEMA_VERSION` is **1**. The separate fixture repository must publish that version. This package does not contain the canonical corpus. Its tests use a miniature in-memory fixture only.

Version 1 expects:

- `manifest.json` with `schemaVersion: 1`, an ISO-8601 `clock`, and the languages in use
- `documents.json`: `DocumentPreview[]` (nouns already split into salient and mentions, no raw text)
- `authors.json`: `AuthorProfile[]`
- `topics.json`: `TopicProfile[]` (`nouns` is a map of language code to lemmas)
- `search_sessions.json`: `SearchSession[]`
- `behavioral.json`: the output of `buildBehavioralPreview(sessions, { minDwellMs: 3000, generatedAt })`

`buildBehavioralPreview` ignores opens shorter than 3000 ms. A future website loads those previews and sends them here. Sliders are weights, not new extractions.

## Run the tests

No API key, database, or web server:

```bash
npm install
npm test
```

Build the package with `npm run build`. The public entry is `scoreDocument`, `scoreCorpus`, `rubricComponents`, `blend`, `buildNounPreview`, `buildBehavioralPreview`, `computeAuthorScore`, `defaultWeights`, and the schema types.
