/** Academy instrument slugs (from the Register links) mapped to the interest form's instrument options. */
const INSTRUMENT_OPTIONS: Record<string, string> = {
  piano: 'Piano',
  'acoustic-guitar': 'Guitar',
  'electric-guitar': 'Guitar',
  bass: 'Bass',
  drums: 'Drums',
};

/** The option to pre-tick for `?instrument=<slug>`, or undefined for an absent or unknown slug. */
export function instrumentOptionFor(slug: string | null | undefined): string | undefined {
  if (!slug || !Object.prototype.hasOwnProperty.call(INSTRUMENT_OPTIONS, slug)) return undefined;
  return INSTRUMENT_OPTIONS[slug];
}
