import { siteUrl } from '@studio-gamo/ui/lib/sites';
import type { PhotoKey } from '@studio-gamo/ui/lib/images';

export interface Program {
  name: string; label: string; title: string; body: string; photo: PhotoKey; href: string;
}
export const programs: Program[] = [
  { name: 'Worship', label: 'Prepared to serve', title: 'Stronger worship, together.', body: 'A planned network connecting churches with prepared musicians, with thoughtful auditioning, fair compensation and standby support where available.', photo: 'worshipLeaderGolden', href: siteUrl('worship') },
  { name: 'Academy', label: 'Room to discover', title: 'A love of music starts here.', body: 'Instrument education for children, teens and adults. Private lessons, group learning and proposed church-hosted programs make room for different learning journeys.', photo: 'boyGuitar', href: siteUrl('academy') },
  { name: 'Live', label: 'Reasons to gather', title: 'Shared faith. Shared experiences.', body: 'Discover Christian concerts, worship gatherings, Bible studies and community events nationwide, or explore the organizer journey.', photo: 'worshipNight', href: siteUrl('live') },
  { name: 'Production', label: 'Skills that support', title: 'Help the message come through.', body: 'Audio, video, livestreaming and technical education designed to strengthen churches and develop the volunteers behind every service.', photo: 'soundEngineer', href: siteUrl('production') },
];

export const participation = [
  { title: 'Churches & ministries', body: 'Explore musician support, host lessons or share the resources your community can offer.', href: '/partners', action: 'Explore partnerships', photo: 'churchModernDay' as PhotoKey },
  { title: 'Musicians', body: 'Discover the preparation and audition journey for serving with the musician collection.', href: siteUrl('worship', '/apply'), action: 'Explore the application', photo: 'acousticLeader' as PhotoKey },
  { title: 'Students & families', body: 'Find an instrument you love and explore a welcoming path into music education.', href: siteUrl('academy', '/instruments'), action: 'Discover instruments', photo: 'girlGuitar' as PhotoKey },
  { title: 'Instructors', body: 'Bring your teaching experience to proposed private, group and community learning programs.', href: '/contact?interest=Teaching', action: 'Explore teaching interest', photo: 'guitarMentor' as PhotoKey },
  { title: 'Christian event organizers', body: 'Learn how to introduce a Christian gathering, prepare event details and request review.', href: siteUrl('live', '/promote'), action: 'Explore event promotion', photo: 'gospelVocalists' as PhotoKey },
  { title: 'Volunteers & community partners', body: 'Offer your time, a learning space, instruments or practical skills as programs grow.', href: '/contact?interest=Volunteering', action: 'Explore ways to help', photo: 'sanctuaryCongregation' as PhotoKey },
  { title: 'Sponsors & supporters', body: 'Explore education sponsorships, equipment support and responsible ways to sustain the mission.', href: '/support', action: 'Explore mission support', photo: 'youngPianist' as PhotoKey },
];

export const generalFaq = [
  { q: 'What is Gamo Studios?', a: 'Gamo Studios is a Christian, mission-driven organization bringing worship support, instrument education, Christian events and technical resources together around one shared mission.' },
  { q: 'How can our church or family participate?', a: 'Churches can request worship coverage or technical assessments, families can register for instrument lessons, and event organizers can submit Christian gatherings for review across our programs.' },
  { q: 'What is Gamo Studios’ legal and tax status?', a: 'Gamo Studios is a Christian, mission-driven organization whose final legal incorporation and federal tax-exempt status remain under evaluation. Contributions are not currently tax-deductible.' },
  { q: 'Do churches need a partnership to participate?', a: 'Partnership is never a requirement for ordinary program participation. Contributions and sponsorships never influence musician vetting or rankings.' },
  { q: 'Are scholarships or sponsored lessons available?', a: 'Sponsored and scholarship-supported education are coordinated as community partnerships and dedicated program support are established.' },
  { q: 'Where do programs operate?', a: 'Our initial local service area for Worship, Academy, and Production is the Phoenix metropolitan area, Arizona. Gamo Live serves Christian events nationwide.' },
  { q: 'How do I get in touch with the team?', a: 'You can reach us through the contact or partnership inquiry forms on our website, and our team will follow up regarding your program interest.' },
];
