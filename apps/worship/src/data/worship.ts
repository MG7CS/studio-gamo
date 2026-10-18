/**
 * Gamo Worship — SAMPLE data for the design-first phase.
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
  { q: 'What does a church contribute?', a: 'Contribution levels are still proposals awaiting board approval. When shown, musician pay and any Gamo administrative allocation always appear as separate line items.' },
  { q: 'What happens if a musician cannot make it?', a: 'Where available, a standby musician who has received the same set list can be asked to step in. Standby support depends on local availability and is never guaranteed.' },
  { q: 'Which churches can request musicians?', a: 'The program is designed to serve Christian congregations of any size, denomination, language or background. Service areas will be announced as the program develops.' },
  { q: 'Are musicians paid fairly?', a: 'Fair, transparent compensation is a core principle. Musician pay is shown on its own line and is never reduced to fund other parts of the organization.' },
];

export interface Opportunity { id: string; church: string; city: string; date: string; role: string; style: string; recurring?: boolean; standby?: boolean; payCents: number }
export const opportunities: Opportunity[] = [
  { id: 'o1', church: 'Riverside Fellowship', city: 'Mesa, AZ', date: 'Sun · Nov 1 · 8:00 AM call', role: 'Keys', style: 'Contemporary worship', recurring: true, payCents: 15000 },
  { id: 'o2', church: 'New Hope Chapel', city: 'Phoenix, AZ', date: 'Sun · Nov 1 · 9:30 AM call', role: 'Bass', style: 'Gospel', payCents: 12500 },
  { id: 'o3', church: 'Grace Community', city: 'Tempe, AZ', date: 'Sat · Nov 7 · 4:00 PM call', role: 'Drums', style: 'Contemporary worship', standby: true, payCents: 6000 },
  { id: 'o4', church: 'Cornerstone Church', city: 'Chandler, AZ', date: 'Sun · Nov 8 · 7:30 AM call', role: 'Vocals', style: 'Hymns & traditional', recurring: true, payCents: 11000 },
  { id: 'o5', church: 'Living Water Church', city: 'Glendale, AZ', date: 'Sun · Nov 15 · 8:30 AM call', role: 'Acoustic guitar', style: 'Bilingual services', payCents: 12000 },
];

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
