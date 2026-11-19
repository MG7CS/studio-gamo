/**
 * Automatic title case for headings (owner direction 2026-11-19). Every heading the shared components
 * render goes through `titleCase` (via `TitleCase.astro`), so authors type headings normally.
 *
 * Rules
 * - The first letter of every word is capitalised, except the small words below.
 * - The first word of a heading is always capitalised.
 * - "&", digits and HTML entities (`&amp;`) are left alone.
 * - A word that already has an upper-case letter after its first letter ("FAQ", "iPad", "Q&A", "McDonald")
 *   is left as typed.
 * - Hyphenated words and words with an apostrophe are capitalised per part at the start only
 *   ("Never-Ending", "Don't": the part after the apostrophe stays lower case).
 */

/** Words that stay lower case in the middle of a heading. */
export const SMALL_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'so',
  'yet',
  'as',
  'at',
  'by',
  'in',
  'of',
  'on',
  'to',
  'from',
  'with',
  'into',
  'onto',
  'over',
  'per',
  'via',
  'is',
]);

const UPPER = /\p{Lu}/u;
const LETTER = /\p{L}/u;

function capitalizeFirstLetter(word: string): string {
  const chars = Array.from(word);
  const i = chars.findIndex((c) => LETTER.test(c));
  if (i === -1) return word;
  chars[i] = chars[i]!.toLocaleUpperCase('en');
  return chars.join('');
}

/** Case one whitespace-free token. `first` is true for the first word of the heading. */
function caseWord(token: string, first: boolean): string {
  // Already mixed or upper case after its first letter: leave as typed.
  const letters = Array.from(token).filter((c) => LETTER.test(c));
  if (letters.slice(1).some((c) => UPPER.test(c))) return token;
  // No letters at all (digits, "&", punctuation): leave alone.
  if (letters.length === 0) return token;
  // The lower-case form without surrounding punctuation decides whether it is a small word.
  const bare = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
  if (!first && SMALL_WORDS.has(bare)) return token.toLowerCase();
  // A digit-led token such as "3D" or "1st" is left alone.
  const firstChar = Array.from(token.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '';
  if (/\p{N}/u.test(firstChar)) return token;
  // Hyphenated words: capitalise each part ("Never-Ending", "One-on-One" keeps "on" small).
  if (token.includes('-') || token.includes('‑')) {
    return token
      .split(/(?<=[-‑])/u)
      .map((part, i) => {
        const partBare = part.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
        if (i > 0 && SMALL_WORDS.has(partBare)) return part.toLowerCase();
        return capitalizeFirstLetter(part);
      })
      .join('');
  }
  return capitalizeFirstLetter(token);
}

/**
 * Title-case a plain text string (no HTML). `startsHeading` says whether the text begins the heading, so its
 * first word is always capitalised; pass false for a later text node of the same heading. `continuesWord` says
 * the text begins in the middle of a word (right after an entity such as `&#8217;`), so its first token is kept.
 */
export function titleCase(text: string, startsHeading = true, continuesWord = false): string {
  let first = startsHeading;
  let skip = continuesWord;
  return text
    .split(/(\s+)/u)
    .map((part) => {
      if (part === '' || /^\s+$/u.test(part)) return part;
      if (skip) {
        skip = false;
        first = false;
        return part;
      }
      const out = caseWord(part, first);
      first = false;
      return out;
    })
    .join('');
}

/**
 * Title-case the text of an HTML fragment: tags, attributes and entities (`&amp;`, `&#8217;`) are never touched,
 * only the text between them. The first word of the first non-empty text node is the heading's first word.
 */
export function titleCaseHtml(html: string): string {
  let first = true;
  let afterEntity = false;
  // Split into tags, entities and text, keeping the separators (odd indices).
  return html
    .split(/(<[^>]*>|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);)/giu)
    .map((part, i) => {
      if (i % 2 === 1) {
        if (part.startsWith('<')) {
          afterEntity = false;
        } else {
          // An entity is content: the next word is no longer the heading's first, and text glued to it
          // (no space between) continues the same word.
          first = false;
          afterEntity = true;
        }
        return part;
      }
      if (part === '') return part;
      const out = titleCase(part, first, afterEntity && !/^\s/u.test(part));
      if (part.trim() !== '') first = false;
      afterEntity = false;
      return out;
    })
    .join('');
}

/**
 * Title-case the content of every heading element (`<h1>` to `<h6>`) inside an HTML fragment, leaving everything
 * else alone. Used by layout components whose copy slot is free-form (SplitHero), so a heading typed there is
 * title-cased without the page wrapping it.
 */
export function titleCaseHeadingsIn(html: string): string {
  return html.replace(
    /(<(h[1-6])\b[^>]*>)([\s\S]*?)(<\/\2>)/giu,
    (_match, open: string, _tag: string, inner: string, close: string) => open + titleCaseHtml(inner) + close,
  );
}
