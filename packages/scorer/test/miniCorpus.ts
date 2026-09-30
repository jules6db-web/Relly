import { buildBehavioralPreview } from "../src/preview/behavior.js";
import type { DocumentPreview, PreviewAuthor, SearchSession, TopicProfile } from "../src/types.js";

/** Fixed clock shared with the scoring tests. Formulas never read the system clock. */
export const CLOCK = "2026-06-01T09:00:00.000Z";

export const payrollTopic: TopicProfile = {
  id: "payroll",
  nouns: {
    nl: ["loonbrief", "brutoloon", "nettoloon"],
    fr: ["fiche", "paie"],
    en: ["payslip", "payroll", "wage"],
    de: ["lohnabrechnung", "gehalt"],
  },
};

export const benefitsTopic: TopicProfile = {
  id: "benefits",
  nouns: {
    nl: ["maaltijdcheque", "groepsverzekering"],
    fr: ["cheque", "repas"],
    en: ["meal", "voucher"],
    de: ["essensgutschein"],
  },
};

const vera: PreviewAuthor = {
  id: "author-vera-maes",
  expertise: 0.96,
  authorReliability: 0.92,
  reliableProfile: true,
  combined: 0.94,
};

const unknownAuthor: PreviewAuthor = {
  id: "author-unknown",
  expertise: 0.5,
  authorReliability: 0.5,
  reliableProfile: false,
  combined: 0.5,
};

const moderate: PreviewAuthor = {
  id: "author-noor-peeters",
  expertise: 0.6,
  authorReliability: 0.55,
  reliableProfile: false,
  combined: 0.575,
};

const camille: PreviewAuthor = {
  id: "author-camille-renard",
  expertise: 0.9,
  authorReliability: 0.9,
  reliableProfile: true,
  combined: 0.9,
};

export function makePreview(
  overrides: Partial<DocumentPreview> & Pick<DocumentPreview, "id">,
): DocumentPreview {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    language: overrides.language ?? "nl",
    createdAt: overrides.createdAt ?? CLOCK,
    documentType: overrides.documentType ?? "unknown",
    viewCount: overrides.viewCount ?? 0,
    nounPreview: overrides.nounPreview ?? { salient: [], mentions: [] },
    citationDocumentIds: overrides.citationDocumentIds ?? [],
    poll: overrides.poll ?? [],
    author: overrides.author ?? unknownAuthor,
  };
}

export const strongPayroll = makePreview({
  id: "strong-payroll-report",
  title: "Loonrun Houtwerf Lenaerts",
  language: "nl",
  createdAt: "2024-06-01T09:00:00.000Z",
  documentType: "official_report",
  viewCount: 900,
  citationDocumentIds: ["french-citation-target"],
  author: vera,
  nounPreview: {
    salient: [
      { lemma: "loonbrief", count: 12 },
      { lemma: "brutoloon", count: 2 },
    ],
    mentions: [],
  },
  poll: [1, 2, 3, 4].map((index) => ({
    useId: `use-strong-${index}`,
    respondentId: `rater-${index}`,
    rating: 5,
    respondentReliability: 0.95,
  })),
});

export const thinNote = makePreview({
  id: "thin-loonbrief-note",
  title: "Korte notitie",
  language: "nl",
  createdAt: "2026-05-31T09:00:00.000Z",
  documentType: "unknown",
  viewCount: 1,
  author: unknownAuthor,
  nounPreview: {
    salient: [{ lemma: "notitie", count: 1 }],
    mentions: [{ lemma: "loonbrief", count: 1 }],
  },
});

export const longDwellMemo = makePreview({
  id: "long-dwell-memo",
  title: "Intern memo loonadministratie",
  language: "nl",
  createdAt: "2026-05-17T09:00:00.000Z",
  documentType: "internal_memo",
  viewCount: 40,
  author: moderate,
  nounPreview: {
    salient: [{ lemma: "vergadering", count: 3 }],
    mentions: [{ lemma: "loonbrief", count: 1 }],
  },
});

export const citationTarget = makePreview({
  id: "french-citation-target",
  title: "Methode de controle",
  language: "fr",
  createdAt: "2025-01-15T09:00:00.000Z",
  documentType: "peer_reviewed",
  viewCount: 12,
  author: camille,
  nounPreview: {
    salient: [
      { lemma: "methode", count: 5 },
      { lemma: "controle", count: 5 },
    ],
    mentions: [],
  },
});

export const neutralNote = makePreview({
  id: "neutral-note",
  title: "Neutrale notitie",
  language: "nl",
  createdAt: "2026-05-02T09:00:00.000Z",
  documentType: "unknown",
  viewCount: 25,
  author: unknownAuthor,
});

export const frenchPayslip = makePreview({
  id: "french-payslip",
  title: "Note fiche de paie",
  language: "fr",
  createdAt: "2026-03-01T09:00:00.000Z",
  documentType: "official_report",
  viewCount: 18,
  author: camille,
  nounPreview: {
    salient: [{ lemma: "fiche de paie", count: 4 }],
    mentions: [],
  },
});

export const englishBenefits = makePreview({
  id: "english-benefits",
  title: "Northmill meal voucher plan",
  language: "en",
  createdAt: "2026-04-01T09:00:00.000Z",
  documentType: "official_report",
  viewCount: 30,
  author: moderate,
  nounPreview: {
    salient: [
      { lemma: "meal", count: 6 },
      { lemma: "voucher", count: 6 },
      { lemma: "benefit", count: 4 },
    ],
    mentions: [{ lemma: "payroll", count: 1 }],
  },
});

export const germanTimeExport = makePreview({
  id: "german-time-export",
  title: "Zeiterfassung Keller",
  language: "de",
  createdAt: "2026-02-01T09:00:00.000Z",
  documentType: "dataset",
  viewCount: 8,
  author: moderate,
  nounPreview: {
    salient: [{ lemma: "zeiterfassung", count: 4 }],
    mentions: [],
  },
});

const mediocre: PreviewAuthor = {
  id: "author-mediocre",
  expertise: 0.45,
  authorReliability: 0.4,
  reliableProfile: false,
  combined: 0.425,
};

export const stuffedPoll = makePreview({
  id: "stuffed-poll",
  title: "Poll dataset",
  language: "en",
  createdAt: "2026-01-10T09:00:00.000Z",
  documentType: "dataset",
  viewCount: 15,
  author: mediocre,
  poll: [
    ...Array.from({ length: 10 }, (_, index) => ({
      useId: `use-stuffed-${index}`,
      respondentId: `low-${index}`,
      rating: 5,
      respondentReliability: 0.1,
    })),
    {
      useId: "use-stuffed-critical",
      respondentId: "critical-rater",
      rating: 2,
      respondentReliability: 0.9,
    },
    {
      useId: "use-stuffed-author",
      respondentId: mediocre.id,
      rating: 5,
      respondentReliability: 0.95,
    },
    {
      useId: "",
      respondentId: "blank-use",
      rating: 5,
      respondentReliability: 0.99,
    },
  ],
});

export const comparisonCorpus: DocumentPreview[] = [
  strongPayroll,
  thinNote,
  longDwellMemo,
  citationTarget,
];

export const sessions: SearchSession[] = [
  {
    searchId: "search-loonbrief-1",
    query: "loonbrief",
    language: "nl",
    opened: [
      { documentId: strongPayroll.id, dwellMs: 180_000 },
      { documentId: longDwellMemo.id, dwellMs: 300_000 },
      { documentId: thinNote.id, dwellMs: 2_000 },
    ],
  },
];

export const behavior = buildBehavioralPreview(sessions, { generatedAt: CLOCK });

export const allPreviews: DocumentPreview[] = [
  strongPayroll,
  thinNote,
  longDwellMemo,
  citationTarget,
  neutralNote,
  frenchPayslip,
  englishBenefits,
  germanTimeExport,
  stuffedPoll,
];
