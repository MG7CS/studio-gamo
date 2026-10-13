/** Staff operations — Gamo Production screens (technical ministry support). */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, queue } from './helpers';

export const productionScreens: DashScreen[] = [
  {
    slug: 'production/requests',
    title: 'Production requests',
    description: 'Church technical support inquiries, acoustic assessments, and event assistance.',
    blocks: [
      queue('Support inquiries queue', [
        ['church', 'Church'], ['type', 'Assistance type'], ['submitted', 'Date'], ['urgency', 'Urgency'], ['status', 'Status'],
      ], [
        { church: 'Grace Fellowship (sample)', type: 'Sanctuary soundboard upgrade', submitted: 'Oct 10', urgency: 'Normal', status: b('Assessment draft', 'pending') },
        { church: 'Trinity Bible Church (sample)', type: 'Livestream camera calibration', submitted: 'Oct 8', urgency: 'High (upcoming broadcast)', status: b('Assigned', 'success') },
        { church: 'Christ Church Valley (sample)', type: 'Acoustic treatment evaluation', submitted: 'Oct 5', urgency: 'Normal', status: b('Initial call scheduled', 'info') },
      ], 'status', ['Assessment draft', 'Assigned', 'Initial call scheduled']),
      decisionDialog('production-decision', 'Production request decision', 'selected inquiry'),
    ],
  },
  {
    slug: 'production/projects',
    title: 'Project tracking',
    description: 'Active technical installations, facility sound improvements, and milestones.',
    blocks: [
      queue('Active technical projects', [
        ['project', 'Project'], ['church', 'Church'], ['phase', 'Current phase'], ['lead', 'Technical lead'], ['target', 'Target completion'],
      ], [
        { project: 'Grace Fellowship Audio Upgrade', church: 'Grace Fellowship (sample)', phase: 'Equipment spec review', lead: 'Jordan Avery (crew)', target: 'Nov 15, 2026' },
        { project: 'Trinity Video Streaming Setup', church: 'Trinity Bible Church (sample)', phase: 'Camera mounting & testing', lead: 'Marcus D. (sample)', target: 'Oct 24, 2026' },
        { project: 'Valley Chapel Acoustic Panels', church: 'Christ Church Valley (sample)', phase: 'Site assessment completed', lead: 'Elena R. (sample)', target: 'Dec 1, 2026' },
      ]),
    ],
  },
  {
    slug: 'production/training',
    title: 'Training programs',
    description: 'Curriculum and workshops for volunteer church sound, lighting, and livestream operators.',
    blocks: [
      {
        type: 'cards',
        title: 'Active volunteer training tracks',
        items: [
          { title: 'Live Sound Essentials for Church Volunteers', meta: '4-Week Practical Course', body: 'Gain confidence behind the mixing console, understand microphone placement, gain staging, and vocal EQ.', icon: 'speaker', badge: b('Enrollment Open', 'success') },
          { title: 'Worship Livestream & Broadcast Audio', meta: '2-Day Intensive', body: 'Deliver broadcast mixes that sound clear, balanced, and immersive for home worshipers.', icon: 'video', badge: b('Upcoming (sample)', 'info') },
          { title: 'Sanctuary Stage Lighting & Media', meta: 'Self-Paced Module', body: 'Enhance worship environments with intentional, reverent lighting design that avoids theatrical distraction.', icon: 'light', badge: b('Draft Curriculum', 'proposal') },
        ],
      },
    ],
  },
  {
    slug: 'production/personnel',
    title: 'Technical personnel & volunteers',
    description: 'Roster of volunteer sound engineers, video directors, and production liaisons.',
    blocks: [
      queue('Technical crew roster (sample)', [
        ['name', 'Technician'], ['specialty', 'Primary skills'], ['availability', 'Availability'], ['region', 'Region'], ['status', 'Status'],
      ], [
        { name: 'Jordan Avery (sample)', specialty: 'Live audio mixing, IEMs', availability: 'Wednesdays, Saturdays', region: 'Phoenix, AZ', status: b('Active (sample)', 'success') },
        { name: 'Marcus D. (sample)', specialty: 'Livestream video, ATEM switcher', availability: 'Sundays', region: 'Phoenix, AZ', status: b('Active (sample)', 'success') },
        { name: 'Elena R. (sample)', specialty: 'Acoustics, Dante networking', availability: 'Weeknights', region: 'Scottsdale, AZ', status: b('Active (sample)', 'success') },
        { name: 'Nathan W. (sample)', specialty: 'DMX lighting, ProPresenter', availability: 'Flexible', region: 'Mesa, AZ', status: b('Training (sample)', 'info') },
      ]),
    ],
  },
];
