import { siteUrl } from '@studio-gamo/ui/lib/sites';
import type { PhotoKey } from '@studio-gamo/ui/lib/images';

export const participation = [
  { title: 'Churches and ministries', body: 'Request musicians, host lessons or share what your community can offer.', href: '/partners', action: 'Explore partnerships', photo: 'churchModernDay' as PhotoKey },
  { title: 'Musicians', body: 'See how preparation and auditions work for the musician collection.', href: '/contact?interest=Musician%20application', action: 'Apply as a musician', photo: 'acousticLeader' as PhotoKey },
  { title: 'Learners and families', body: 'Find an instrument you love and a welcoming path into music.', href: siteUrl('academy', '/instruments'), action: 'Discover instruments', photo: 'girlGuitar' as PhotoKey },
  { title: 'Instructors', body: 'Bring your teaching experience to private, group and community lessons.', href: '/contact?interest=Teaching', action: 'Express teaching interest', photo: 'guitarMentor' as PhotoKey },
  { title: 'Event organizers', body: 'Share a Christian gathering, prepare the details and request review.', href: siteUrl('live', '/organizer'), action: 'List an event', photo: 'gospelVocalists' as PhotoKey },
  { title: 'Volunteers and partners', body: 'Offer your time, a space, instruments or practical skills.', href: '/contact?interest=Volunteering', action: 'Ways to help', photo: 'sanctuaryCongregation' as PhotoKey },
  { title: 'Sponsors and supporters', body: 'Class sponsorships, equipment and responsible ways to sustain the mission.', href: '/support', action: 'Support the mission', photo: 'youngPianist' as PhotoKey },
];

export const generalFaq = [
  { q: 'What is Gamo Studios?', a: 'A Christian, mission-driven organization that brings worship musicians, music lessons, Christian events and technical support together around one mission.' },
  { q: 'What kind of organization is it?', a: 'Gamo Studios is a Christian, mission-driven Public Benefit Corporation.' },
  { q: 'How can a church, group or family take part?', a: 'Send an inquiry from the contact page. Event organizers can create an account on Gamo Live and submit a Christian gathering for review. An inquiry does not enroll a student or approve an application.' },
  { q: 'Do churches need a partnership to take part?', a: 'No. Partnership is never required. Contributions and sponsorships never affect musician vetting or rankings.' },
  { q: 'Are sponsored lessons available?', a: 'Churches and organizations can sponsor classes. Sponsored classes start as each partnership is agreed.' },
  { q: 'Where do programs operate?', a: 'Worship, Academy and Production start in the Phoenix area, Arizona. Gamo Live serves Christian events nationwide.' },
  { q: 'How do I reach the team?', a: 'Email hello@gamostudio.org from the contact page. A person reads every message and replies by email.' },
];
