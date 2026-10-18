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

export interface PhotoEntry {
  stem: string;
  widths: number[];
  width: number;
  height: number;
  alt: string;
  position: string;
  tone: 'bright' | 'warm' | 'dark';
}

const meta = {
  worshipLeaderGolden: {
    stem: 'worship-gospel-worship-leader-golden-light',
    alt: 'Gospel worship leader singing with eyes closed in warm golden light',
    position: '50% 22%',
    tone: 'warm',
  },
  acousticLeader: {
    stem: 'worship-acoustic-worship-leader-stage',
    alt: 'Worship leader singing and playing acoustic guitar on stage',
    position: '45% 25%',
    tone: 'dark',
  },
  acousticLeaderAlt: {
    stem: 'worship-acoustic-worship-leader-stage-alt',
    alt: 'Musician leading worship with an acoustic guitar under warm stage lights',
    position: '45% 25%',
    tone: 'dark',
  },
  worshipBand: {
    stem: 'worship-worship-band-sanctuary',
    alt: 'Worship team with vocalists, guitar, drums and keys leading in a bright sanctuary',
    position: '55% 35%',
    tone: 'warm',
  },
  boyGuitar: {
    stem: 'academy-boy-learning-acoustic-guitar',
    alt: 'Smiling boy learning to play acoustic guitar in a sunlit room',
    position: '50% 30%',
    tone: 'bright',
  },
  girlGuitar: {
    stem: 'academy-girl-practicing-acoustic-guitar',
    alt: 'Young girl practicing acoustic guitar beside a music stand',
    position: '50% 28%',
    tone: 'bright',
  },
  youngPianist: {
    stem: 'academy-young-pianist-bright-classroom',
    alt: 'Young pianist smiling while playing a keyboard in a bright classroom',
    position: '45% 30%',
    tone: 'bright',
  },
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
  sanctuaryCongregation: {
    stem: 'community-sunlit-sanctuary-congregation',
    alt: 'Congregation worshipping together in a sunlit sanctuary',
    position: '50% 45%',
    tone: 'bright',
  },
  guitarMentor: {
    stem: 'community-guitar-mentor-with-student',
    alt: 'Guitar instructor guiding a young student through a chord',
    position: '55% 40%',
    tone: 'warm',
  },
  concertCrowdWide: {
    stem: 'live-worship-concert-crowd-wide',
    alt: 'Crowd with hands raised at a worship concert beneath a lit cross',
    position: '50% 40%',
    tone: 'dark',
  },
  worshipNight: {
    stem: 'live-worship-night-hands-raised',
    alt: 'Worship night audience with raised hands under colourful stage lights',
    position: '50% 40%',
    tone: 'dark',
  },
  gospelVocalists: {
    stem: 'live-gospel-vocalists-concert-stage',
    alt: 'Gospel vocalists leading a concert as the audience worships',
    position: '50% 30%',
    tone: 'dark',
  },
  soundEngineer: {
    stem: 'production-sound-engineer-mixing-console',
    alt: 'Sound engineer wearing headphones at a digital mixing console during worship',
    position: '40% 40%',
    tone: 'dark',
  },
} as const satisfies Record<string, Pick<PhotoEntry, 'stem' | 'alt' | 'position' | 'tone'>>;

export type PhotoKey = keyof typeof meta;

type ManifestEntry = { width: number; height: number; widths: number[] };
const m = manifest as Record<string, ManifestEntry>;

export const photos = Object.fromEntries(
  Object.entries(meta).map(([key, value]) => {
    const entry = m[value.stem];
    if (!entry)
      throw new Error(
        `Photo "${key}" (${value.stem}) missing from image-manifest.json — run \`make images\`.`,
      );
    return [key, { ...value, widths: entry.widths, width: entry.width, height: entry.height }];
  }),
) as Record<PhotoKey, PhotoEntry>;
