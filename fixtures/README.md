# sdworx-customer-scoring-fixtures

Synthetische previews en zoeklogs voor fictieve klantendossiers in payroll en HR. Dit is alleen de fixture-repository, schemaversie 1. Er zit geen scoringbibliotheek, geen website en geen deploy in.

This is not an official SD Worx product. The companies, authors, and employee numbers are fictional. There is no real client data, no national register number, no bank account, and no wage tied to a person.

A future website reads this repository and sends it to the library. Sliders are weights, not new extractions. Moving a weight recomputes the blend in the library. It does not extract nouns again and it does not call the model again.

## Clock

`manifest.json` fixes the clock at `2026-06-01T09:00:00.000Z`. Document ages are measured from that instant. The scoring library must use this injected clock and must not read the system clock.

## Files

| File | Contents |
| --- | --- |
| `manifest.json` | Schema version 1, clock, domain, languages `nl`, `fr`, `en`, `de` |
| `authors.json` | `AuthorProfile[]` |
| `topics.json` | `TopicProfile[]` for the seven topic ids |
| `documents.json` | `DocumentPreview[]` |
| `search_sessions.json` | `SearchSession[]` |
| `behavioral.json` | `BehavioralPreview` |

Titles are short labels. They are not scoring input. Noun arrays already follow the salient/mention split, as if the extractor had run. There are no raw document files.

## Behavioral aggregate

`behavioral.json` is the committed output of `buildBehavioralPreview` on `search_sessions.json`. The minimum dwell is 3000. Opens shorter than 3000 ms are ignored. `generatedAt` is the manifest clock, and `minDwellMs` is 3000.

Each query is normalized with the same function as noun keys: Unicode lowercase, strip punctuation, split on non-letters, then drop stopwords for the session language (`nl`, `fr`, `en`, `de`). There is no stemmer. For each remaining term, every eligible open adds its `dwellMs`. The same document is summed across sessions. `maxDwellMs` is the largest document total for that term.

`fiche de paie` contributes `fiche` and `paie`, because `de` is a French stopword. `meal voucher` contributes `meal` and `voucher`. `Zeiterfassung` is stored as `zeiterfassung`.

In `search-loonbrief-a` the longest open is unambiguous: `doc-houtwerf-dwell-memo` stays open for 480000 ms, ahead of every other document in that session. The thin note `doc-houtwerf-payroll-note` is opened for 2000 ms, 2500 ms, 1800 ms, and 1000 ms. All four are shorter than 3000 ms, so it has no dwell credit.

## Noun keys

Salient nouns are outside the generic-noun list and have a count of at least 2, or they are among the ten most frequent detected nouns. Mentions are the other detected nouns. On the thin note, the long-dwell memo, and the absence overview, `loonbrief` has count 1 and ten other nouns are more frequent, so it is only a mention.

The English benefits plan stores the extractor keys `meal` and `voucher`. Both keys are listed on topic `benefits` for `en`. The French payslip explainer stores `fiche` and `paie`. Both keys are listed on topic `payroll` for `fr`. The German time export stores `zeiterfassung`.

Generic nouns such as document, file, informatie, gegevens, klant, fichier, données, Datei, and Kunde are not used as salient nouns.

## Author score stored on each preview

`author.combined` uses the profile formula stored on the preview:

`baseReliability = reliableProfile ? max(authorReliability, 0.7) : authorReliability`

`combined = 0.5 * expertise + 0.5 * baseReliability`

The result is rounded to 4 decimal places. Inputs are already in `[0, 1]`. Track-record shrinkage needs prior rubric reliabilities from the scoring library. This repository does not run that library, so `authorReliability` stays the profile value.

## Documents

| Id | What it is for |
| --- | --- |
| `doc-houtwerf-payroll-report` | Dutch `official_report`, about two years old, high `viewCount`, three in-corpus citations, reliable high-expertise author, salient `loonbrief`, four high-reliability 5-star votes that each have a `useId` |
| `doc-houtwerf-payroll-note` | Dutch `unknown` note from the day before the clock, one view, no citations, author at 0.5 and not a reliable profile, `loonbrief` only as a single mention, no poll |
| `doc-houtwerf-dwell-memo` | Dutch `internal_memo`, weak `loonbrief` mention, moderate author, longest open after a `loonbrief` search |
| `doc-northmill-poll-dataset` | English `dataset`, mediocre author. Ten 5-star votes at reliability 0.1, one 2-star vote at 0.9, one 5-star vote from the author, and one 5-star vote with no `useId` |
| `doc-keller-primary-source` | German `primary_source` from six years before the clock, strong author, in-corpus and external citations, almost no views, no poll |
| `doc-neutral-note` | English `unknown` note, 30 days old, author fields 0.5, no citations, no poll, modest views |
| `doc-clarin-peer-review` | French `peer_reviewed` citation target with a strong author, cited by the payroll report |
| `doc-clarin-payslip-explainer` | French explainer with salient `fiche` and `paie` |
| `doc-keller-time-export` | German export with salient `zeiterfassung` |
| `doc-northmill-benefits-plan` | English benefits plan with salient `meal` and `voucher` |
| `doc-houtwerf-absence-overview` | Dutch absence overview with salient `ziektebrief`, long dwell on absence searches, weak payroll nouns |
| `doc-clarin-contract-amendment` | French amendment with salient `avenant`. No document cites it |
| `doc-houtwerf-employee-file` | Dutch employee file labelled `EMP-10422` |
| `doc-northmill-withholding` | English withholding note |
| `doc-keller-lohnsteuer` | German wage-tax note |

Clients are Houtwerf Lenaerts BV, Atelier Clarin SA, Northmill Components Ltd, and Keller & Sohn GmbH. `cite-external-lohnindex-2018` is an external citation id. It is not a document in this corpus.

The vote without `useId` on `doc-northmill-poll-dataset` is intentional. The library drops it, together with the author's own vote.

## Not stored

Whether a document is ongoing or completed is not stored, not scored, and not shown. Forbidden raw-text keys are absent: `text`, `body`, `content`, `file`, `bytes`, `html`, `pdf`. No string field is longer than 500 characters. Languages `nl`, `fr`, `en`, and `de` each appear on at least one document.
