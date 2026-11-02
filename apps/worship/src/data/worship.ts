/**
 * Gamo Worship: SAMPLE data for the design-first phase.
 * Every person, church, service and amount below is fictional and must be labeled as sample in the UI.
 * Amounts are integer minor units (cents) and are PROPOSALS only.
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
  { title: 'Share the occasion', body: 'Date, call time, location, style and the roles you need. One date or a recurring pattern.' },
  { title: 'Add repertoire', body: 'Set list, keys, charts or recordings so musicians arrive prepared.' },
  { title: 'Review the match', body: 'A coordinator proposes vetted musicians who fit the instruments, style and dates.' },
  { title: 'Confirm together', body: 'Your team confirms rehearsal details. Nothing is final until both sides agree.' },
];

export const auditionSteps: Step[] = [
  { title: 'Apply', body: 'Instruments, styles, experience and the teams you have served with.' },
  { title: 'Audition', body: 'Two recordings: one worship song and one of your choosing.' },
  { title: 'Meet', body: 'A meeting with Gamo, on video or in person, about faith, preparation and reliability.' },
  { title: 'Approval', body: 'Approved musicians join the collection and start receiving opportunities.' },
];

export const faqs = [
  { q: 'How does Gamo Worship work?', a: 'A church or group submits a request with the date, roles and repertoire. A Gamo Worship coordinator proposes vetted musicians who fit.' },
  { q: 'Who can request musicians?', a: 'Churches, ministries, families, schools and other groups, for a service, a concert, an event or almost any occasion, on any day.' },
  { q: 'How are musicians vetted?', a: 'Application, recorded audition, a meeting with Gamo and a reference review. Payment, sponsorship or partnership never affects vetting or how musicians are presented.' },
  { q: 'What does it cost?', a: 'Contribution levels are proposals until approved. When shown, musician pay and any Gamo administrative allocation are separate line items.' },
  { q: 'What if a musician cannot make it?', a: 'Where available, a standby musician who received the same set list can step in. Standby support depends on local availability and is never guaranteed.' },
  { q: 'Are musicians paid fairly?', a: 'Yes. Musician pay is shown on its own line and is never reduced to fund other parts of Gamo.' },
  { q: 'Where is Gamo Worship available?', a: 'Service areas will be announced as the program develops.' },
];

export interface Opportunity { id: string; church: string; city: string; date: string; role: string; style: string; recurring?: boolean; standby?: boolean; payCents: number }
export const opportunities: Opportunity[] = [
  { id: 'o1', church: 'Riverside Fellowship', city: 'Mesa, AZ', date: 'Sun · Nov 1 · 8:00 AM call', role: 'Keys', style: 'Contemporary worship', recurring: true, payCents: 15000 },
  { id: 'o2', church: 'New Hope Chapel', city: 'Phoenix, AZ', date: 'Sun · Nov 1 · 9:30 AM call', role: 'Bass', style: 'Gospel', payCents: 12500 },
  { id: 'o3', church: 'Grace Community', city: 'Tempe, AZ', date: 'Sat · Nov 7 · 4:00 PM call', role: 'Drums', style: 'Contemporary worship', standby: true, payCents: 6000 },
  { id: 'o4', church: 'Cornerstone Church', city: 'Chandler, AZ', date: 'Sun · Nov 8 · 7:30 AM call', role: 'Vocals', style: 'Hymns & traditional', recurring: true, payCents: 11000 },
  { id: 'o5', church: 'Living Water Church', city: 'Glendale, AZ', date: 'Sun · Nov 15 · 8:30 AM call', role: 'Acoustic guitar', style: 'Bilingual services', payCents: 12000 },
];

export { formatUsd } from '@studio-gamo/ui/lib/format';
