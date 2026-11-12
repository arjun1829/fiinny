/**
 * Search tokens stored on each marketplace card, so search is one indexed
 * `array-contains` query instead of scanning the catalogue.
 *
 * Clients split the query with the same rules (app/lib/marketplace-search.ts,
 * mobile marketplace_search.dart): if these change, change those too.
 */

export const MIN_TOKEN = 2;
export const MAX_TOKEN = 15;
const MAX_WORD = 30;
const MAX_TOKENS = 1000;
const MAX_NAME_TOKENS = 500;
const MAX_DESCRIPTION_WORDS = 100;

// \p{M} keeps Devanagari vowel signs attached to their letters.
const WORD_SPLIT = new RegExp("[^\\p{L}\\p{M}\\p{N}]+", "u");

export function searchWords(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().split(WORD_SPLIT).filter(Boolean);
}

/**
 * Marks a phonetic token in searchKeywords. Query words never contain it
 * (WORD_SPLIT removes it), so a phonetic token can only match a phonetic
 * query token.
 */
export const PHONETIC_MARK = "~";
const MIN_PHONETIC = 2;

/**
 * Sound-alike key for a Latin-script word, so farmers' spellings of the same
 * word meet: power / powar / pawar / pavar -> "pwr", gramoxone / gramoxon ->
 * "grmxn", sulphur / salphur / sulfur -> "slfr". Keeps the first letter,
 * maps letters that sound alike, drops vowels and h, collapses repeats.
 * "" for non-Latin words or keys shorter than 2.
 *
 * Copies: app/lib/marketplace-cards.ts phoneticKey(), mobile
 * lib/features/marketplace/data/marketplace_search.dart phoneticKey().
 * All three must give the same key for the same word.
 */
export function phoneticKey(word: string): string {
  const w = word.toLowerCase();
  if (!/^[a-z0-9]+$/.test(w) || /^[0-9]+$/.test(w)) return "";
  const mapped = w
    .replace(/ph/g, "f")
    .replace(/[v]/g, "w")
    .replace(/[qc]/g, "k")
    .replace(/z/g, "j");
  let out = mapped[0];
  for (const ch of mapped.slice(1)) {
    if ("aeiouyh".includes(ch)) continue;
    if (out[out.length - 1] === ch) continue;
    out += ch;
  }
  return out.length >= MIN_PHONETIC ? out : "";
}

/** Words a farmer may type for a category, keyed by lower-case category. */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  seeds: ["seed", "beej", "bij", "biyane", "बीज", "बियाणे"],
  fertilizers: ["fertilizer", "fertiliser", "khad", "khaad", "khat", "urvarak", "खाद", "खत", "उर्वरक"],
  pesticides: ["pesticide", "dawai", "dawa", "dava", "aushadh", "kitnashak", "keetnashak", "कीटनाशक", "दवाई", "औषध"],
  insecticides: ["insecticide", "kitnashak", "keetnashak", "keeda", "kida", "कीटनाशक", "कीड़ा"],
  fungicides: ["fungicide", "fafundnashak", "bursheenashak", "फफूंदनाशक", "बुरशीनाशक"],
  herbicides: ["herbicide", "weedicide", "kharpatwar", "kharpatvar", "tannashak", "खरपतवारनाशक", "तणनाशक"],
  "bio-stimulants": ["biostimulant", "stimulant", "tonic", "growth", "promoter"],
  adjuvants: ["adjuvant", "sticker", "spreader", "chipko"],
  sprayers: ["sprayer", "spray", "pump", "favarni", "फवारणी", "पंप"],
  tools: ["tool", "auzar", "aujar", "औजार"],
};

/** Common spellings of product words, keyed by the word in the product name. */
const WORD_SYNONYMS: Record<string, string[]> = {
  urea: ["uria", "yuria", "yuriya", "यूरिया"],
  dap: ["डीएपी"],
  potash: ["potas", "potaash", "पोटाश"],
  zinc: ["jinc", "zink", "जिंक"],
  sulphur: ["sulfur", "gandhak", "गंधक"],
  sulfur: ["sulphur", "gandhak", "गंधक"],
  neem: ["nim", "नीम"],
  humic: ["humik", "ह्यूमिक"],
};

function addPrefixes(out: Set<string>, word: string): void {
  const w = word.slice(0, MAX_WORD);
  for (let len = MIN_TOKEN; len <= Math.min(MAX_TOKEN, w.length); len++) out.add(w.slice(0, len));
}

/** Every substring, so "phos" also finds "superphosphate". */
function addSubstrings(out: Set<string>, word: string): void {
  const w = word.slice(0, MAX_WORD);
  for (let i = 0; i < w.length; i++) {
    for (let len = MIN_TOKEN; len <= MAX_TOKEN && i + len <= w.length; len++) {
      out.add(w.slice(i, i + len));
    }
  }
}

/** "~pwr" plus its prefixes ("~pw"), so a half-typed "pow" also matches. */
function addPhonetic(out: Set<string>, word: string): void {
  const key = phoneticKey(word).slice(0, MAX_TOKEN);
  for (let len = MIN_PHONETIC; len <= key.length; len++) out.add(PHONETIC_MARK + key.slice(0, len));
}

export function buildSearchKeywords(input: {
  names: string[];
  category: string;
  storeNames: string[];
  description: string;
  /** Searches an admin linked to this product (searchLinks/{cardId}.terms). */
  aliases?: string[];
}): string[] {
  const out = new Set<string>();

  // Highest priority first: the list is capped at MAX_TOKENS.
  const nameWords = input.names.flatMap(searchWords);
  const aliasWords = (input.aliases ?? []).flatMap(searchWords);
  for (const w of nameWords) addSubstrings(out, w);
  // A linked search must always find its product, so its words come next.
  for (const w of aliasWords) addPrefixes(out, w);
  for (const w of [...nameWords, ...aliasWords]) addPhonetic(out, w);
  for (const w of nameWords) for (const syn of WORD_SYNONYMS[w] ?? []) addPrefixes(out, syn);

  for (const w of searchWords(input.category)) addPrefixes(out, w);
  for (const syn of CATEGORY_SYNONYMS[input.category.trim().toLowerCase()] ?? []) {
    for (const w of searchWords(syn)) addPrefixes(out, w);
  }

  for (const w of input.storeNames.flatMap(searchWords)) addPrefixes(out, w);
  for (const w of searchWords(input.description).slice(0, MAX_DESCRIPTION_WORDS)) addPrefixes(out, w);

  return Array.from(out).slice(0, MAX_TOKENS);
}

/**
 * Substrings of the product's own name words only. The sellers' add-product
 * search matches names, and descriptions, categories and shop names in
 * searchKeywords would crowd name matches out of its small result window.
 */
export function buildNameKeywords(names: string[]): string[] {
  const out = new Set<string>();
  for (const w of names.flatMap(searchWords)) addSubstrings(out, w);
  return Array.from(out).slice(0, MAX_NAME_TOKENS);
}
