/**
 * Gamo Production — design-phase content.
 * Gamo Production is a proposed program of a developing Christian, mission-driven Public Benefit Corporation.
 * Nothing here describes completed projects, clients or partner churches.
 */
import type { PhotoKey } from '@studio-gamo/ui/lib/images';
import type { IconName } from '@studio-gamo/ui/lib/icons';

export interface SupportArea {
  slug: string;
  title: string;
  short: string;
  icon: IconName;
  photo: PhotoKey;
  photoPosition?: string;
  summary: string;
  /** What support in this area is intended to cover. */
  covers: string[];
  /** Skills volunteers would build. */
  volunteerSkills: string[];
  /** Questions a church can think through before a conversation. */
  questions: string[];
}

export const supportAreas: SupportArea[] = [
  {
    slug: 'audio',
    title: 'Church Audio',
    short: 'Clear, intelligible sound for worship and the spoken word.',
    icon: 'sliders',
    photo: 'soundEngineer',
    summary:
      'Help for sound teams who want every lyric, prayer and sermon to be heard clearly — from gain structure and monitor mixes to simple, repeatable Sunday routines.',
    covers: ['Gain staging and channel organization', 'Monitor and in-ear mix strategy', 'Speech intelligibility for preaching', 'Saving scenes and service templates'],
    volunteerSkills: ['Line check routine', 'Building a balanced worship mix', 'Feedback prevention', 'Calm troubleshooting during a service'],
    questions: ['What does your current mixer and speaker setup look like?', 'Where do people say the sound is hardest to hear?', 'How many volunteers run sound each month?'],
  },
  {
    slug: 'livestream-video',
    title: 'Livestreaming & Video',
    short: 'Reliable streams for members who worship from home.',
    icon: 'video',
    photo: 'concertCrowdWide',
    summary:
      'Guidance for churches serving homebound members, families and travelers online — camera placement, stream audio, encoder settings and a pre-service checklist.',
    covers: ['Camera placement and framing', 'A dedicated stream audio mix', 'Encoder and bandwidth basics', 'Pre-service stream checklist'],
    volunteerSkills: ['Switching between camera shots', 'Monitoring stream health', 'Lower-thirds and scripture slides', 'Archiving services'],
    questions: ['Who watches your services online today?', 'Which part of the stream is least reliable?', 'What internet connection is available in the sanctuary?'],
  },
  {
    slug: 'lighting-media',
    title: 'Lighting & Media',
    short: 'Warm, distraction-free light and clear presentation.',
    icon: 'light',
    photo: 'gospelVocalists',
    summary:
      'Support for lighting and presentation teams so faces are visible, lyrics are legible and the room serves worship rather than distracting from it.',
    covers: ['Front light for faces and cameras', 'Simple cue stacks for services', 'Lyric and scripture slide standards', 'Screen visibility and contrast'],
    volunteerSkills: ['Programming basic looks', 'Running lyrics in time with the band', 'Preparing slides before Sunday', 'Safe fixture handling'],
    questions: ['Can people on camera be seen clearly?', 'Who prepares lyrics and announcements?', 'Are any fixtures difficult or unsafe to reach?'],
  },
  {
    slug: 'training',
    title: 'Technical Education',
    short: 'Volunteer training that builds confidence and continuity.',
    icon: 'school',
    photo: 'guitarMentor',
    summary:
      'Patient, hands-on teaching for volunteers of every experience level, so technical ministry does not depend on one person and new servers are welcomed well.',
    covers: ['Role-based onboarding paths', 'Hands-on practice sessions', 'Written routines for each position', 'Mentoring newer volunteers'],
    volunteerSkills: ['Audio fundamentals', 'Camera and switching basics', 'Lighting and presentation', 'Serving with humility under pressure'],
    questions: ['How are new technical volunteers trained today?', 'Which role is hardest to staff?', 'Would weekday or Saturday sessions work better?'],
  },
  {
    slug: 'event-support',
    title: 'Event Production Support',
    short: 'Planning help for conferences, concerts and special services.',
    icon: 'calendar',
    photo: 'worshipNight',
    summary:
      'Planning support for Christmas and Easter services, worship nights and conferences — run-of-show, stage plots, input lists and a calm advance plan.',
    covers: ['Run-of-show and cue planning', 'Stage plots and input lists', 'Rental and staffing considerations', 'Rehearsal and changeover timing'],
    volunteerSkills: ['Reading a run-of-show', 'Quick changeovers between sets', 'Clear headset communication', 'Post-event debrief'],
    questions: ['What event are you preparing for and when?', 'How large is the expected gathering?', 'What equipment would need to be added?'],
  },
  {
    slug: 'facility-guidance',
    title: 'Equipment & Facility Guidance',
    short: 'Steward resources well before buying anything new.',
    icon: 'building',
    photo: 'churchModernDay',
    summary:
      'Independent, stewardship-minded guidance on what to keep, repair, replace or wait on — so budgets serve the congregation and purchases fit the room.',
    covers: ['Equipment inventory and condition review', 'Room acoustics observations', 'Phased improvement planning', 'Questions to ask vendors'],
    volunteerSkills: ['Keeping an equipment inventory', 'Basic maintenance and cable care', 'Labeling and patch documentation', 'Planning within a budget'],
    questions: ['What equipment is failing or frustrating today?', 'Is a renovation or new building planned?', 'What budget range is realistic this year?'],
  },
];

export const getArea = (slug: string) => supportAreas.find((a) => a.slug === slug);

export interface TrainingTrack {
  title: string;
  level: string;
  format: string;
  icon: IconName;
  topics: string[];
}

export const trainingTracks: TrainingTrack[] = [
  { title: 'Sound Team Foundations', level: 'New volunteers', format: 'Proposed · 4 hands-on sessions', icon: 'sliders', topics: ['Signal flow from mic to speaker', 'Line check routine', 'Building a vocal-forward mix'] },
  { title: 'Livestream Operator', level: 'New to intermediate', format: 'Proposed · 3 sessions', icon: 'video', topics: ['Camera framing for worship', 'Stream audio mix', 'Pre-service checklist'] },
  { title: 'Lighting & Presentation', level: 'New volunteers', format: 'Proposed · 2 sessions', icon: 'light', topics: ['Front light for faces', 'Simple service cues', 'Lyric timing with the band'] },
  { title: 'Technical Team Leaders', level: 'Experienced volunteers', format: 'Proposed · 3 sessions', icon: 'users', topics: ['Scheduling and onboarding', 'Writing team routines', 'Leading calmly under pressure'] },
];

export const assessmentSteps = [
  { label: 'Your church' },
  { label: 'Current setup' },
  { label: 'Priorities' },
  { label: 'Team & timing' },
  { label: 'Review' },
];

export const productionFaq = [
  { q: 'How does a church get started with Gamo Production?', a: 'Start with our five-step church needs assessment or submit a consultation request so our team can review your current setup, room, and volunteer goals.' },
  { q: 'How are contributions structured?', a: 'Any fees or suggested contributions remain proposals until approved, and support is designed to remain accessible to small and under-resourced congregations.' },
  { q: 'Do you sell equipment?', a: 'No. Guidance is independent and stewardship-minded. Recommendations never depend on vendor relationships.' },
  { q: 'Can small churches take part?', a: 'Yes — small congregations with volunteer teams are a central focus of Gamo Production.' },
];
