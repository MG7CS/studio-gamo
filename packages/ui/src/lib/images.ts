/**
 * Photo catalog for the 2026 bright brand refresh.
 *
 * Keys are stable, human-readable names. Stems/widths come from the generated
 * `image-manifest.json` (written by `make images`). Missing catalog entries fail
 * at build time; browser verification checks that the delivered files load.
 *
 * `position` is the recommended CSS object-position that keeps faces, hands and
 * instruments visible in tight crops. Override per placement when needed.
 * Full inventory and intended pages: docs/ASSET_INVENTORY_2026.md
 */
import manifest from './image-manifest.json';

/**
 * The four frame ratios as width / height (docs/FRONTEND_ARCHITECTURE.md "Photo frames"). The CSS
 * tokens `--ratio-*` in tokens.frame.css hold the same values; frames.test.ts checks they agree.
 */
export const PHOTO_RATIOS = {
  portrait: 4 / 5,
  landscape: 3 / 2,
  wide: 21 / 8,
  square: 1,
} as const;
export type PhotoRatio = keyof typeof PHOTO_RATIOS;

/** Share of the source picture that stays inside a frame of `target` ratio (object-fit: cover). */
export function cropKept(source: number, target: number): number {
  return target > source ? source / target : target / source;
}

/**
 * A ratio is allowed for a photo when at least this share of the source stays in frame. One focal
 * point cannot serve every crop: a 4:5 portrait source keeps 30% of itself as a 21:8 banner (not
 * allowed) but 53% as a 3:2 landscape (allowed).
 */
export const MIN_CROP_KEPT = 0.5;

export interface PhotoEntry {
  stem: string;
  widths: number[];
  width: number;
  height: number;
  alt: string;
  position: string;
  tone: 'bright' | 'warm' | 'dark';
  /** Focal point in percent (derived from `position`). Frames map it to object-position. */
  focal: { x: number; y: number };
  /** Frame ratios this photo may be cropped to: derived from its size, unless the entry sets `ratios`. */
  ratios: PhotoRatio[];
}

const meta = {
  churchModernDay: {
    stem: 'churches-modern-church-exterior-daylight',
    alt: 'Modern church building with a cross on a sunny day',
    position: '60% 45%',
    tone: 'bright',
  },
  churchGoldenHour: {
    stem: 'churches-modern-church-exterior-golden-hour',
    alt: 'Contemporary church exterior at golden hour',
    position: '55% 50%',
    tone: 'warm',
  },
  chapelSpring: {
    stem: 'churches-white-chapel-steeple-spring',
    alt: 'White chapel with a steeple surrounded by spring trees',
    position: '60% 50%',
    tone: 'bright',
  },
  instrumentPianoKeyboard: {
    stem: 'instruments-piano-keyboard',
    alt: 'Piano keys beside a window',
    position: '50% 55%',
    tone: 'dark',
  },
  instrumentAcousticGuitar: {
    stem: 'instruments-acoustic-guitar',
    alt: 'Acoustic guitar seen from above on a wooden floor',
    position: '50% 45%',
    tone: 'warm',
  },
  instrumentElectricGuitar: {
    stem: 'instruments-electric-guitar',
    alt: 'White electric guitar leaning among plants',
    position: '50% 45%',
    tone: 'bright',
  },
  instrumentBassGuitar: {
    stem: 'instruments-bass-guitar',
    alt: 'Natural-wood bass guitar against a dark wall',
    position: '50% 45%',
    tone: 'dark',
  },
  instrumentDrums: {
    stem: 'instruments-drums',
    alt: 'Drum kit in warm light',
    position: '50% 50%',
    tone: 'warm',
  },
  instrumentVocals: {
    stem: 'instruments-vocals-microphone',
    alt: 'Microphone on a stand against a terracotta wall',
    position: '50% 40%',
    tone: 'warm',
  },
  instrumentViolin: {
    stem: 'instruments-violin',
    alt: 'Violin and bow resting on a wooden table',
    position: '50% 45%',
    tone: 'warm',
  },
  instrumentCello: {
    stem: 'instruments-cello',
    alt: 'Cellist seated with a cello in soft light',
    position: '50% 45%',
    tone: 'dark',
  },
  instrumentSaxophone: {
    stem: 'instruments-saxophone',
    alt: 'Gold alto saxophone on a marble surface',
    position: '50% 45%',
    tone: 'bright',
  },
  instrumentTrumpet: {
    stem: 'instruments-trumpet',
    alt: 'Trumpet standing upright against a cream wall',
    position: '50% 45%',
    tone: 'bright',
  },
  instrumentUkulele: {
    stem: 'instruments-ukulele',
    alt: 'Ukulele resting on a cream sofa',
    position: '50% 50%',
    tone: 'bright',
  },
  instrumentMusicTheory: {
    stem: 'instruments-music-theory',
    alt: 'Open music book on a piano desk',
    position: '50% 50%',
    tone: 'bright',
  },
  musicianWorshipLeader: {
    stem: 'musicians-worship-leader-vocalist',
    alt: 'Vocalist singing into a microphone on a dark stage',
    position: '50% 30%',
    tone: 'dark',
  },
  musicianAcousticGuitarist: {
    stem: 'musicians-acoustic-guitarist',
    alt: 'Guitarist playing an acoustic guitar by a window',
    position: '50% 50%',
    tone: 'bright',
  },
  musicianElectricGuitarist: {
    stem: 'musicians-electric-guitarist',
    alt: 'Hands on an electric guitar in warm light',
    position: '50% 40%',
    tone: 'warm',
  },
  musicianKeysPlayer: {
    stem: 'musicians-keys-player',
    alt: 'Keyboard player seen from behind',
    position: '50% 50%',
    tone: 'dark',
  },
  musicianDrummer: {
    stem: 'musicians-drummer',
    alt: 'Drummer playing on a stage',
    position: '50% 50%',
    tone: 'dark',
  },
  musicianBassist: {
    stem: 'musicians-bassist',
    alt: 'Hands on a bass guitar in soft light',
    position: '50% 50%',
    tone: 'warm',
  },
  musicianChoir: {
    stem: 'musicians-choir',
    alt: 'Adult choir singing in terracotta robes',
    position: '50% 45%',
    tone: 'warm',
  },
  musicianFullBand: {
    stem: 'musicians-full-band',
    alt: 'Worship band on stage facing a large auditorium',
    position: '50% 55%',
    tone: 'dark',
  },
  musicianStrings: {
    stem: 'musicians-strings-player',
    alt: 'Close view of a cello being played',
    position: '50% 50%',
    tone: 'warm',
  },
  musicianBrass: {
    stem: 'musicians-brass-player',
    alt: 'Trumpet player in warm light',
    position: '50% 50%',
    tone: 'warm',
  },
  techAudio: {
    stem: 'tech-audio-sound',
    alt: 'Sound engineer at a large live mixing console',
    position: '50% 55%',
    tone: 'warm',
  },
  techVideoCamera: {
    stem: 'tech-video-camera',
    alt: 'Camcorder filming a church service',
    position: '50% 55%',
    tone: 'warm',
  },
  techLighting: {
    stem: 'tech-lighting',
    alt: 'Stage lighting fixtures on a rig',
    position: '50% 50%',
    tone: 'bright',
  },
  techLivestream: {
    stem: 'tech-livestream',
    alt: 'Livestream production team at a video switcher',
    position: '50% 30%',
    tone: 'dark',
  },
  techStageSetup: {
    stem: 'tech-stage-setup',
    alt: 'Microphone stand, chair and speakers on a stage',
    position: '50% 55%',
    tone: 'bright',
  },
  techTraining: {
    stem: 'tech-training',
    alt: 'Two people at a camera monitor, one teaching the other',
    position: '50% 50%',
    tone: 'warm',
  },
  techSlides: {
    stem: 'tech-slides-lyrics',
    alt: 'Congregation facing a band and a projected slide',
    position: '50% 50%',
    tone: 'warm',
  },
  softwareWebsite: {
    stem: 'software-website-development',
    alt: 'Two people designing a web page layout at a wooden table',
    position: '50% 50%',
    tone: 'warm',
  },
  softwareMobileApp: {
    stem: 'software-mobile-app',
    alt: 'Hand holding a phone with a blank screen',
    position: '50% 45%',
    tone: 'warm',
  },
  softwareTeam: {
    stem: 'software-team-collaboration',
    alt: 'Three people working together at a wooden table',
    position: '50% 50%',
    tone: 'warm',
  },
  softwareSupport: {
    stem: 'software-support-maintenance',
    alt: 'One person helping another with a laptop',
    position: '50% 50%',
    tone: 'bright',
  },
} as const satisfies Record<
  string,
  Pick<PhotoEntry, 'stem' | 'alt' | 'position' | 'tone'> & { ratios?: readonly PhotoRatio[] }
>;

export type PhotoKey = keyof typeof meta;

type ManifestEntry = { width: number; height: number; widths: number[] };
const m = manifest as Record<string, ManifestEntry>;

/** "50% 22%" → { x: 50, y: 22 }. Only the two-percentage form is allowed so every photo has a focal point. */
function focalFromPosition(key: string, position: string): { x: number; y: number } {
  const m = /^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(position);
  if (!m) throw new Error(`Photo "${key}" position "${position}" must be two percentages, e.g. "50% 30%".`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

export const photos = Object.fromEntries(
  Object.entries(meta).map(([key, value]) => {
    const entry = m[value.stem];
    if (!entry)
      throw new Error(
        `Photo "${key}" (${value.stem}) missing from image-manifest.json — run \`make images\`.`,
      );
    const source = entry.width / entry.height;
    const override = (value as { ratios?: readonly PhotoRatio[] }).ratios;
    const ratios = override
      ? [...override]
      : (Object.keys(PHOTO_RATIOS) as PhotoRatio[]).filter(
          (r) => cropKept(source, PHOTO_RATIOS[r]) >= MIN_CROP_KEPT,
        );
    return [
      key,
      {
        ...value,
        widths: entry.widths,
        width: entry.width,
        height: entry.height,
        focal: focalFromPosition(key, value.position),
        ratios,
      },
    ];
  }),
) as Record<PhotoKey, PhotoEntry>;
