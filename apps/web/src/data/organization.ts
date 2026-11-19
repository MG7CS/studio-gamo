/**
 * Organization-site content: the ways to take part (one list for /, /get-started and /get-involved) and the
 * general FAQ. Ordered Academy → Worship → Production, then organization-wide paths.
 */
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import type { PhotoKey } from '@studio-gamo/ui/lib/images';

export interface ParticipationPath {
  /** Who this path is for. */
  title: string;
  /** Program or area the path leads into. */
  area: string;
  /** One-sentence next step (path chooser cards). */
  next: string;
  /** Longer description (get-involved cards). */
  body: string;
  href: string;
  photo: PhotoKey;
}

export const participation: ParticipationPath[] = [
  {
    title: 'Students & families',
    area: 'Gamo Academy',
    next: 'Find an instrument and a lesson close to home.',
    body: 'Find an instrument you love and a welcoming way into music lessons, for children, teens and adults.',
    href: siteUrl('academy', '/lessons'),
    photo: 'girlGuitar',
  },
  {
    title: 'Instructors',
    area: 'Gamo Academy',
    next: 'Teach private, group and community lessons.',
    body: 'Bring your teaching experience to private, small-group and community lessons with Gamo Academy.',
    href: '/contact?interest=Teaching',
    photo: 'guitarMentor',
  },
  {
    title: 'Churches & ministries',
    area: 'Gamo Worship',
    next: 'Request worship musicians for your services.',
    body: 'Request prepared worship musicians, host lessons or share what your community can offer.',
    href: siteUrl('web', '/worship/request'),
    photo: 'churchModernDay',
  },
  {
    title: 'Musicians',
    area: 'Gamo Worship',
    next: 'Apply to serve churches as a worship musician.',
    body: 'Learn about the preparation and audition journey for serving churches as a Gamo Worship musician.',
    href: siteUrl('web', '/worship/apply'),
    photo: 'acousticLeader',
  },
  {
    title: 'Sound & media volunteers',
    area: 'Gamo Production',
    next: 'Grow in sound, livestream and lighting ministry.',
    body: 'Grow in sanctuary audio, livestreaming and lighting through hands-on training for church volunteers.',
    href: siteUrl('production', '/training'),
    photo: 'soundEngineer',
  },
  {
    title: 'Sponsors & partners',
    area: 'Gamo Studios',
    next: 'Sponsor lessons through your church or organization.',
    body: 'Sponsor lessons through your church or organization, or share a space, instruments, skills or time.',
    href: '/partners/interest',
    photo: 'sanctuaryCongregation',
  },
];

export const generalFaq = [
  { q: 'What is Gamo Studios?', a: 'Gamo Studios is a Christian, mission-driven organization bringing music education, worship support and technical resources together around one shared mission.' },
  { q: 'How can our church or family participate?', a: 'Families, churches and musicians can send a program inquiry for review. An inquiry does not enroll a student or approve an application.' },
  { q: 'What kind of organization is Gamo Studios?', a: 'Gamo Studios is a Christian, mission-driven Public Benefit Corporation, formed to be mission-driven and not only profit-seeking.' },
  { q: 'Do churches need a partnership to participate?', a: 'Partnership is never a requirement for ordinary program participation. Contributions and partnerships never influence musician vetting or rankings.' },
  { q: 'Are lessons sponsored?', a: 'Lessons are sponsored through partner organizations and churches. Details are shaped with each partner and shared when confirmed.' },
  { q: 'Where do programs operate?', a: 'Academy, Worship and Production begin in the Phoenix metropolitan area, Arizona.' },
  { q: 'How do I get in touch with the team?', a: 'Email us at hello@gamostudio.org. Our team reads every message and replies by email.' },
];
