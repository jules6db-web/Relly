import type { NounPreview } from "../types.js";

const MIN_KNOWN_LENGTH = 2;
const MIN_GENERIC_LENGTH = 3;
const SALIENT_CAP = 40;
const MENTION_CAP = 80;

const STOPWORDS: Record<string, Set<string>> = {
  nl: words(`
    de het een van en in op te dat die is zijn was voor met niet aan om ook als tot uit bij nog wel maar over kan naar
    dan men der des zij hij zij haar hun wij jullie u dit deze dit die of want omdat terwijl wanneer waar hoe wat wie
    welke welk geen niets alles veel meer meest minder onder tussen tegen zonder binnen buiten reeds reeds er hier daar
    deze diegene zo zeer al reeds dus toch eens iets niets niets niets mijn jouw zijn haar ons jullie hun deze
    ben bent was waren geweest hebben heeft had hadden worden wordt werd zouden zal zullen kan kunnen moet moeten
    dit dat deze die
  `),
  fr: words(`
    le la les de des du un une et en au aux a à ou mais donc or ni car que qui quoi dont où pour par sur dans avec sans
    sous entre vers chez ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ne pas plus
    moins très elle il ils elles on nous vous je tu y se est sont été être etre avoir ont fait faire comme si lorsque
    quand tout tous toute toutes au aux d l qu n s c
  `),
  en: words(`
    the a an of and or but in on to for from with without as at by if then than that this these those is are was were
    be been being it its itself he she they them his her their our your we you i not no nor so very can could should
    would will just about into over after before between out up down off too also do does did doing have has had having
    my me him them ours yours theirs what which who whom whose when where why how there here such only own same other
    than then once
  `),
  de: words(`
    der die das den dem des ein eine einer einem einen und oder aber in im zu zur von mit auf für fur ist sind war sein
    nicht auch als am vom über uber unter aus bei nach vor dem den dass daß wenn weil wie wo wer was welche welcher
    welches diesem dieser dieses diese jene jener jenes ich du er sie es wir ihr man sich uns euch ihnen mein dein
    kein keine keinen keiner keine vom zum zur bin bist seid gewesen haben hat hatte hatten wird werden wurde wurden
    kann können konnte muss müssen musste soll sollen sollte
  `),
};

const VERBS: Record<string, Set<string>> = {
  nl: words(`
    zijn is was waren geweest hebben heeft had hadden worden wordt werd kunnen kan moet moeten zullen zal maken maakt
    gemaakt gebruiken gebruikt gaan gaat komen komt zien ziet geven geeft zeggen zegt werken werkt houden houdt laten
    laat vinden vindt weten weet denken denkt kijken kijkt helpen helpt starten start eindigen openen sluiten tonen
    toont blijven blijft blijken blijkt betreffen betreft volgen volgt staan staat lijken lijkt heten heet noemen noemt
    vragen vraagt antwoorden antwoordt ontvangen ontvangt versturen verstuurt berekenen berekent betalen betaalt
    inhouden inhoudt
  `),
  fr: words(`
    est sont être etre avoir fait faire ont avait étaient etaient peut peuvent doit doivent explique expliquer
    présente presenter décrit decrit concerne concernent comprend inclut inclure utiliser utilise montrer montre
    calculer calcule verser verse sont ete était etait seront serait auraient aurait doivent
  `),
  en: words(`
    run running runs make makes made use uses used using include includes included provide provides provided show shows
    showed follow follows need needs needed want wants go going went come came see seen get got take took taken give
    gave given say said tell told ask asked work works worked working call called try tried keep kept let put seem
    seemed become became leave left find found know knew known think thought look looked help helped start started end
    ended close closed
  `),
  de: words(`
    ist sind war waren sein hat haben hatte wird werden kann können muss müssen macht machen zeigt zeigen geht gehen
    kommt kommen gibt geben sagt sagen arbeitet arbeiten bleibt bleiben folgt folgen steht stehen scheint scheinen
    heißt heisst nennt nennen fragt fragen antwortet antworten berechnet berechnen zahlt zahlen enthält enthalten
  `),
};

const GENERIC: Record<string, Set<string>> = {
  en: words("document file information data page overview customer client"),
  nl: words("document bestand informatie gegevens klant pagina overzicht cliënt client"),
  fr: words("document fichier information données client page aperçu apercu"),
  de: words("dokument datei information daten kunde seite übersicht uebersicht"),
};

const GENERIC_UNION = new Set<string>(
  Object.values(GENERIC).flatMap((set) => [...set]),
);

const KNOWN_LANGUAGES = new Set(["nl", "fr", "en", "de"]);

export type TokenizeOptions = {
  dropStopwords?: boolean;
  minLength?: number;
};

export function primaryLanguage(language: string): string {
  return language.trim().toLowerCase().split("-")[0] ?? "";
}

export function tokenize(text: string, language: string, options?: TokenizeOptions): string[] {
  const lang = primaryLanguage(language);
  const known = KNOWN_LANGUAGES.has(lang);
  const dropStopwords = options?.dropStopwords ?? known;
  const minLength = options?.minLength ?? (known ? MIN_KNOWN_LENGTH : MIN_GENERIC_LENGTH);
  const lower = text.normalize("NFKC").toLowerCase();
  const parts = lower.split(/[^\p{L}]+/u).filter((part) => part.length > 0);
  const stops = dropStopwords ? (STOPWORDS[lang] ?? new Set<string>()) : new Set<string>();
  return parts.filter((token) => token.length >= minLength && !stops.has(token));
}

export type NounPreviewOptions = {
  maxSalient?: number;
  maxMentions?: number;
};

/**
 * Detect nouns and split them into salient nouns and ordinary mentions.
 * Dutch, French, English, and German use closed-class lists. Any other language
 * keeps letter tokens of length at least 3 and only holds generic nouns out of the salient set.
 */
export function buildNounPreview(
  text: string,
  language: string,
  options?: NounPreviewOptions,
): NounPreview {
  const lang = primaryLanguage(language);
  const known = KNOWN_LANGUAGES.has(lang);
  const tokens = tokenize(text, lang, {
    dropStopwords: known,
    minLength: known ? MIN_KNOWN_LENGTH : MIN_GENERIC_LENGTH,
  });
  const verbs = known ? (VERBS[lang] ?? new Set<string>()) : new Set<string>();
  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (verbs.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const detected = [...counts.entries()].sort(byCountThenLemma);
  const generic = genericNounsFor(lang);
  const topFrequent = new Set(detected.slice(0, 10).map(([lemma]) => lemma));
  const salientAll: { lemma: string; count: number }[] = [];
  const mentionAll: { lemma: string; count: number }[] = [];

  for (const [lemma, count] of detected) {
    const salient = !generic.has(lemma) && (count >= 2 || topFrequent.has(lemma));
    if (salient) salientAll.push({ lemma, count });
    else mentionAll.push({ lemma, count });
  }

  salientAll.sort(byCountThenLemmaItem);
  const maxSalient = options?.maxSalient ?? SALIENT_CAP;
  const maxMentions = options?.maxMentions ?? MENTION_CAP;
  const salient = salientAll.slice(0, maxSalient);
  const overflow = salientAll.slice(maxSalient);
  const mentions = [...overflow, ...mentionAll]
    .sort(byCountThenLemmaItem)
    .slice(0, maxMentions);

  return { salient, mentions };
}

export function genericNounsFor(language: string): Set<string> {
  const lang = primaryLanguage(language);
  return GENERIC[lang] ?? GENERIC_UNION;
}

function words(source: string): Set<string> {
  return new Set(
    source
      .trim()
      .split(/\s+/)
      .map((word) => word.normalize("NFKC").toLowerCase())
      .filter((word) => word.length > 0),
  );
}

function byCountThenLemma(a: [string, number], b: [string, number]): number {
  return b[1] - a[1] || a[0].localeCompare(b[0]);
}

function byCountThenLemmaItem(
  a: { lemma: string; count: number },
  b: { lemma: string; count: number },
): number {
  return b.count - a.count || a.lemma.localeCompare(b.lemma);
}
