/**
 * Registration happens on an instrument, not a scheduled lesson: the class a family registers for is
 * "<instrument>", with place and time confirmed by email. Pure helpers, no framework imports.
 */
import { ACADEMY_INSTRUMENTS, type AcademyInstrument } from '@gamo/config/academy-instruments';
import type { AcademyLessonRef } from '@gamo/domain';

export function findInstrument(slug: string | undefined): AcademyInstrument | null {
  return ACADEMY_INSTRUMENTS.find((i) => i.slug === slug) ?? null;
}

/** The registration reference for an instrument class: no lesson slug, no schedule, no online price. */
export function instrumentClassRef(instrument: AcademyInstrument): AcademyLessonRef {
  return {
    programSlug: instrument.slug,
    slug: null,
    title: instrument.name,
    location: '',
    scheduleText: '',
    sample: false,
    amountCents: null,
    currency: 'usd',
    startsAt: null,
    termEndsAt: null,
  };
}

/** The instrument name for a stored registration (its `program_slug`), or a neutral word if unknown. */
export function registrationClassTitle(programSlug: string): string {
  return findInstrument(programSlug)?.name ?? 'Class';
}
