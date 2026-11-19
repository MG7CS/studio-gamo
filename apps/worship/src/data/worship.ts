/**
 * Gamo Worship public content. No person, church, date, town or pay amount appears here: contribution
 * levels stay with the board until approved.
 */
// Narrow instrument icons keep data independent of Astro component modules.
type InstrumentIcon = 'piano' | 'guitar' | 'drums' | 'music' | 'mic' | 'sliders';

export interface Instrument { name: string; icon: InstrumentIcon; roles: string }
export const instruments: Instrument[] = [
  { name: 'Keys & piano', icon: 'piano', roles: 'Piano, organ, synth pads, music direction' },
  { name: 'Acoustic & electric guitar', icon: 'guitar', roles: 'Rhythm, lead, ambient textures' },
  { name: 'Drums & percussion', icon: 'drums', roles: 'Kit, cajón, auxiliary percussion' },
  { name: 'Bass', icon: 'music', roles: 'Electric and upright bass' },
  { name: 'Vocals', icon: 'mic', roles: 'Lead worship, harmony, choir support' },
  { name: 'Sound & media', icon: 'sliders', roles: 'Front-of-house, monitors, lyrics' },
];

export const styles = ['Contemporary worship', 'Gospel', 'Hymns & traditional', 'Choir & anthem', 'Acoustic / small-room', 'Bilingual services'];

export interface Step { title: string; body: string }
export const requestSteps: Step[] = [
  { title: 'Share the service', body: 'Date, call time, location, style and the roles you need — one Sunday or a recurring pattern.' },
  { title: 'Add repertoire', body: 'Set list, keys, charts or recordings so musicians arrive prepared.' },
  { title: 'Review the match', body: 'A coordinator proposes vetted musicians whose instruments, style and availability fit.' },
  { title: 'Confirm together', body: 'Your team confirms rehearsal details. Nothing is final until both sides agree.' },
];

export const auditionSteps: Step[] = [
  { title: 'Apply', body: 'Instruments, styles, experience and the churches or teams you have served with.' },
  { title: 'Audition', body: 'Submit two recordings: one worship song and one of your choosing.' },
  { title: 'Conversation', body: 'A short call about faith, preparation, punctuality and serving a congregation.' },
  { title: 'Approval', body: 'Approved musicians join the collection and can receive opportunities.' },
];

export const faqs = [
  { q: 'How does Gamo Worship work?', a: 'Churches submit a service request with their date, roles, and repertoire, and a Gamo Worship coordinator proposes vetted musicians whose instruments, style, and availability fit.' },
  { q: 'How are musicians vetted?', a: 'Our review process includes an application, recorded audition, a conversation with a coordinator and reference review. Payment, sponsorship or partnership never affects vetting or how musicians are presented.' },
  { q: 'What does a church contribute?', a: 'Contribution levels are proposals until the board approves them. When shown, musician pay and any Gamo administrative allocation always appear as separate line items.' },
  { q: 'What happens if a musician cannot make it?', a: 'Where available, a standby musician who has received the same set list can be asked to step in. Standby support depends on local availability and is never guaranteed.' },
  { q: 'Which churches can request musicians?', a: 'The program is designed to serve Christian congregations of any size, denomination, language or background. Service areas will be announced as they open.' },
  { q: 'Are musicians paid fairly?', a: 'Fair, transparent compensation is a core principle. Musician pay is shown on its own line and is never reduced to fund other parts of the organization.' },
];

/** Instruments Gamo Worship is recruiting musicians for, shown on the public /opportunities page. */
export interface MusicianRole { instrument: string; icon: InstrumentIcon; involves: string }
export const musicianRoles: MusicianRole[] = [
  { instrument: 'Keys & piano', icon: 'piano', involves: 'Lead or support the band from piano, organ or synth pads, and help with music direction when a team needs it.' },
  { instrument: 'Acoustic & electric guitar', icon: 'guitar', involves: 'Play rhythm, lead or ambient parts from shared charts, in the key and arrangement the worship leader sets.' },
  { instrument: 'Drums & percussion', icon: 'drums', involves: 'Keep steady, room-appropriate time on kit, cajón or auxiliary percussion, from quiet hymns to full worship sets.' },
  { instrument: 'Bass', icon: 'music', involves: 'Lock in with drums and keys on electric or upright bass, following the set list and keys shared before rehearsal.' },
  { instrument: 'Vocals', icon: 'mic', involves: 'Lead worship or sing harmony and choir support, prepared with the set list, keys and lyrics in advance.' },
  { instrument: 'Sound & media', icon: 'sliders', involves: 'Run front-of-house, monitors or lyrics so the congregation can hear clearly and sing along.' },
];
