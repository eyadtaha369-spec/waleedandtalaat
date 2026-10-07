const ARABIC_DIACRITICS_AND_TATWEEL = /[ً-ٰٟـ]/g;
const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;

/**
 * Normalizes Arabic text so visually/phonetically equivalent spellings
 * (with or without diacritics, alternate letter forms, or non-Latin
 * digits) compare equal — without this, a search for "محمد" would miss
 * "مُحَمَّد" and "٠١٠" would miss "010".
 */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(ARABIC_DIACRITICS_AND_TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, "");
}

/**
 * A token with at least 3 digits is treated as a phone fragment and
 * compared digit-only with the leading zero stripped from both sides —
 * 28 prod accounts are stored without their leading 0, so "01012…" and
 * "1012…" must both match a stored number either way.
 */
function tokenMatchesField(token: string, field: string): boolean {
  const tokenDigits = token.replace(/\D/g, "");
  if (tokenDigits.length >= 3) {
    const fieldDigits = stripLeadingZeros(field.replace(/\D/g, ""));
    if (fieldDigits.includes(stripLeadingZeros(tokenDigits))) return true;
  }
  return field.includes(token);
}

/**
 * Every space-separated token of the (already normalized) query must
 * match at least one haystack field — fields are compared after the
 * same normalization, so callers should pass raw (not pre-normalized)
 * strings here and let this function normalize them consistently.
 */
export function matchesQuery(haystack: string[], query: string): boolean {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const normalizedHaystack = haystack.map((h) => normalizeSearch(h ?? ""));
  return tokens.every((token) =>
    normalizedHaystack.some((field) => tokenMatchesField(token, field)),
  );
}
