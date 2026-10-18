/**
 * SAMPLE instructor profiles — fictional people for layout only.
 * No photos are used for instructors; avatars render initials.
 */
export interface Instructor {
  slug: string;
  name: string;
  initials: string;
  instruments: string[];
  instrumentSlugs: string[];
  city: string;
  teaches: string;
  formats: ('Private' | 'Group' | 'Online')[];
  bio: string;
  approach: string[];
  tone: string;
}

export const instructors: Instructor[] = [
  {
    slug: 'maya-thompson', name: 'Maya Thompson', initials: 'MT', instruments: ['Piano', 'Vocals'],
    instrumentSlugs: ['piano', 'vocals'], city: 'Dallas, TX', teaches: 'Kids & beginners',
    formats: ['Private', 'Online'], tone: 'bg-terracotta text-white',
    bio: 'A patient piano and voice teacher who loves helping young students hear their first song come together.',
    approach: ['Short, focused lessons for younger students', 'Reading music alongside playing by ear', 'A practice plan families can follow at home'],
  },
  {
    slug: 'daniel-reyes', name: 'Daniel Reyes', initials: 'DR', instruments: ['Acoustic guitar', 'Electric guitar'],
    instrumentSlugs: ['acoustic-guitar', 'electric-guitar'], city: 'Phoenix, AZ', teaches: 'Teens & adults',
    formats: ['Private', 'Group'], tone: 'bg-charcoal text-cream',
    bio: 'Guitarist and band coach focused on getting students playing real songs with other musicians early.',
    approach: ['Songs first, theory woven in', 'Small-group band sessions', 'Healthy technique from day one'],
  },
  {
    slug: 'grace-okafor', name: 'Grace Okafor', initials: 'GO', instruments: ['Vocals'],
    instrumentSlugs: ['vocals'], city: 'Atlanta, GA', teaches: 'All ages',
    formats: ['Private', 'Group', 'Online'], tone: 'bg-gold text-charcoal',
    bio: 'Vocal coach for soloists and choirs, with a focus on breath, healthy range and harmony.',
    approach: ['Vocal health and warm-up routines', 'Harmony and ensemble listening', 'Confidence for first performances'],
  },
  {
    slug: 'samuel-park', name: 'Samuel Park', initials: 'SP', instruments: ['Drums & percussion', 'Bass guitar'],
    instrumentSlugs: ['drums', 'bass'], city: 'Seattle, WA', teaches: 'Kids, teens & adults',
    formats: ['Private', 'Group'], tone: 'bg-muted text-white',
    bio: 'Rhythm-section teacher who helps students feel time, play with dynamics and listen as a band.',
    approach: ['Practice-pad foundations', 'Groove and timing games', 'Playing together as a rhythm section'],
  },
];

export const instructorBySlug = (slug: string) => instructors.find((i) => i.slug === slug);
