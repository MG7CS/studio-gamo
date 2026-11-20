/**
 * Photos for the form wizard card (`WizardCard`): one default photo per form kind and, where a screen is about
 * something specific, its own. Keyed by form kind, then by section id; a form slug may have its own entry that
 * wins over its kind (forms of one kind that need different photos, such as two `contact` forms); a section staff add later falls back to
 * the form's `default`. Owner photo policy (2026-11-20): the instrument, musician and technical-job photos go on
 * screens about an instrument, a kind of musician or a technical job; the original church, general, mission and
 * closing photos stay on church, general and closing screens. Adjacent screens never share a photo.
 */
import type { PhotoKey } from './images';

export interface FormPhotos {
  default: PhotoKey;
  bySection: Record<string, PhotoKey>;
}

const MAP: Record<string, FormPhotos> = {
  musician_application: {
    default: 'worshipLeaderGolden',
    bySection: {
      about: 'worshipLeaderGolden',
      music: 'musicianAcousticGuitarist',
      church: 'churchModernDay',
      media: 'musicianElectricGuitarist',
      guardian: 'girlGuitar',
      agree: 'acousticLeaderAlt',
    },
  },
  technician_application: {
    default: 'soundEngineer',
    bySection: {
      about: 'soundEngineer',
      skills: 'techAudio',
      church: 'churchGoldenHour',
      guardian: 'techTraining',
      agree: 'worshipNight',
    },
  },
  church_request: {
    default: 'sanctuaryCongregation',
    bySection: {
      church: 'sanctuaryCongregation',
      service: 'worshipBand',
      agree: 'churchModernDay',
    },
  },
  production_request: {
    default: 'churchGoldenHour',
    bySection: {
      who: 'churchGoldenHour',
      event: 'techLighting',
      agree: 'sanctuaryCongregation',
    },
  },
  contact: {
    default: 'churchModernDay',
    bySection: { message: 'churchModernDay' },
  },
  partner_interest: {
    default: 'sanctuaryCongregation',
    bySection: {
      about: 'sanctuaryCongregation',
      interest: 'churchGoldenHour',
    },
  },
};

const BY_SLUG: Record<string, FormPhotos> = {
  'academy-teach': {
    default: 'guitarMentor',
    bySection: {
      about: 'guitarMentor',
      teaching: 'instrumentMusicTheory',
      availability: 'acousticLeader',
      church: 'churchModernDay',
      media: 'musicianStrings',
      agree: 'worshipNight',
    },
  },
  'academy-host': {
    default: 'churchGoldenHour',
    bySection: {
      church: 'churchGoldenHour',
      space: 'sanctuaryCongregation',
      notes: 'chapelSpring',
      agree: 'churchModernDay',
    },
  },
  volunteer: {
    default: 'sanctuaryCongregation',
    bySection: {
      about: 'sanctuaryCongregation',
      help: 'techAudio',
      agree: 'worshipBand',
    },
  },
  'academy-interest': {
    default: 'youngPianist',
    bySection: {
      who: 'youngPianist',
      lessons: 'instrumentUkulele',
      notes: 'boyGuitar',
      agree: 'girlGuitar',
    },
  },
};

const NEUTRAL: FormPhotos = { default: 'churchModernDay', bySection: {} };

/**
 * The photo map of a form: its slug's own entry if it has one, else its kind's; an unknown kind gets one
 * neutral church photo.
 */
export function formPhotosFor(kind: string, slug?: string): FormPhotos {
  return (slug !== undefined ? BY_SLUG[slug] : undefined) ?? MAP[kind] ?? NEUTRAL;
}
