/**
 * Gamo Studios — Personal account workspace (design-first demo).
 * One human holding multiple roles across multiple programs and organizations.
 * No real authentication or authorization: persona is fixed to Jordan Avery (demo).
 */
import { b, workspaceDirectory, type Workspace } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

const dir = workspaceDirectory();

export const accountWorkspace: Workspace = {
  id: 'account',
  site: 'web',
  basePath: '/account',
  program: 'Gamo Studios',
  name: 'Personal account',
  role: 'Account holder',
  permission: 'Personal data & memberships',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'roles', label: 'Roles & programs', icon: 'user', badge: '4' },
      { slug: 'organizations', label: 'Organizations', icon: 'building', badge: '1' },
    ] },
    { label: 'Preferences', items: [
      { slug: 'profile', label: 'Profile', icon: 'user' },
      { slug: 'notifications', label: 'Notifications', icon: 'bell', badge: '3' },
      { slug: 'settings', label: 'Account settings', icon: 'settings' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Your Gamo account',
      description: 'One personal identity across worship, music education, Christian events and technical ministry.',
      actions: [
        { label: 'Edit profile', href: '/account/profile', icon: 'user' },
        { label: 'Manage roles', href: '/account/roles', variant: 'secondary' },
      ],
      blocks: [
        {
          type: 'notice',
          tone: 'info',
          title: 'One account, many roles',
          body: 'You do not need separate accounts for each program. As Jordan Avery, you participate in Gamo Worship as a musician, teach piano in Gamo Academy, organize Christian events in Gamo Live, and serve as an administrator at Grace Fellowship (sample). Switch between workspaces anytime using the switcher in the header.',
        },
        {
          type: 'cards',
          span: 3,
          title: 'Your active program workspaces',
          description: 'Jump directly to any program area connected to your personal account.',
          items: dir
            .filter((w) => w.id !== 'account' && !w.staff)
            .map((w) => ({
              title: w.label,
              meta: `${w.program} · ${w.role}${w.organization ? ` (${w.organization})` : ''}`,
              body: `Open your ${w.role.toLowerCase()} dashboard for ${w.program}.`,
              href: w.href,
              icon: w.id === 'musician' ? 'music' : w.id === 'church' ? 'church' : w.id.includes('family') || w.id.includes('instructor') ? 'school' : w.id.includes('organizer') ? 'ticket' : 'wrench',
              badge: b('Active (sample)', 'success'),
            })),
        },
        {
          type: 'kv',
          span: 2,
          title: 'Identity and authorization model',
          description: 'How permissions and boundaries will be enforced in production.',
          items: [
            ['Personal account', 'Jordan Avery (jordan.avery@example.org)'],
            ['Active organization', 'Grace Fellowship (sample)'],
            ['Active roles', 'Musician (Worship), Instructor (Academy), Church Admin, Organizer (Live)'],
            ['Program boundaries', 'Worship vetting never alters Academy instructor screening'],
            ['Minors privacy boundary', 'Student personal data strictly isolated to authorized guardians & instructors'],
            ['Financial boundary', 'Musician pay, instructor pay and ticket proceeds separated from administrative allocations'],
          ],
        },
        {
          type: 'actions',
          title: 'Quick shortcuts',
          items: [
            { label: 'Role selection & requests', href: '/account/roles', icon: 'user' },
            { label: 'Organization affiliations', href: '/account/organizations', icon: 'building' },
            { label: 'Notification preferences', href: '/account/notifications', icon: 'bell' },
            { label: 'Security & login settings', href: '/account/settings', icon: 'lock' },
          ],
        },
      ],
    },
    {
      slug: 'roles',
      title: 'Roles & programs',
      description: 'Review your current roles and request participation in additional Gamo programs.',
      actions: [{ label: 'Request new role', dialog: 'request-role', icon: 'plus' }],
      blocks: [
        {
          type: 'notice',
          tone: 'info',
          title: 'Review process',
          body: 'Some roles (such as Worship musician, Academy instructor, or Live ticketed organizer) require audition, screening or verification before receiving requests or publishing. Fictional sample statuses are shown below.',
        },
        {
          type: 'table',
          title: 'Current role affiliations',
          columns: [
            { key: 'program', label: 'Program', primary: true },
            { key: 'role', label: 'Role' },
            { key: 'scope', label: 'Scope' },
            { key: 'status', label: 'Status' },
            { key: 'action', label: 'Workspace' },
          ],
          rows: [
            { program: 'Gamo Worship', role: 'Musician (keys, vocals)', scope: 'Individual', status: b('Under review (sample)', 'pending'), action: 'Available in demo' },
            { program: 'Gamo Worship', role: 'Church administrator', scope: 'Grace Fellowship (sample)', status: b('Active (sample)', 'success'), action: 'Available in demo' },
            { program: 'Gamo Academy', role: 'Parent / guardian', scope: 'Ava & Eli Avery (sample)', status: b('Active (sample)', 'success'), action: 'Available in demo' },
            { program: 'Gamo Academy', role: 'Instructor (piano)', scope: 'Individual / Church hosted', status: b('Screening pending', 'pending'), action: 'Available in demo' },
            { program: 'Gamo Live', role: 'Event organizer', scope: 'Grace Fellowship (sample)', status: b('Draft mode (sample)', 'info'), action: 'Available in demo' },
            { program: 'Gamo Production', role: 'Church client contact', scope: 'Grace Fellowship (sample)', status: b('Active (sample)', 'success'), action: 'Available in demo' },
          ],
        },
        {
          type: 'dialog',
          id: 'request-role',
          title: 'Request a program role',
          body: 'Select a program you would like to participate in. A staff coordinator will follow up.',
          fields: [
            { name: 'program', label: 'Program', type: 'select', options: ['Gamo Worship — Musician', 'Gamo Academy — Instructor', 'Gamo Live — Organizer', 'Gamo Production — Volunteer Technician'], required: true },
            { name: 'experience', label: 'Background / experience note', type: 'textarea', placeholder: 'Brief summary of your background and availability' },
            { name: 'affirm', label: 'I understand this is a sample preview request.', type: 'checkbox', required: true },
          ],
          confirmLabel: 'Submit role request (demo)',
          successText: 'Role request recorded in this preview only. Staff was not notified.',
        },
      ],
    },
    {
      slug: 'organizations',
      title: 'Organization affiliations',
      description: 'Churches and organizations your personal account is connected to.',
      actions: [{ label: 'Connect church', dialog: 'connect-org', icon: 'plus' }],
      blocks: [
        {
          type: 'table',
          title: 'Affiliated organizations',
          columns: [
            { key: 'org', label: 'Organization', primary: true },
            { key: 'location', label: 'Location' },
            { key: 'yourRole', label: 'Your role' },
            { key: 'permission', label: 'Permission level' },
            { key: 'status', label: 'Status' },
          ],
          rows: [
            {
              org: 'Grace Fellowship (sample)',
              location: 'Phoenix, AZ (sample)',
              yourRole: 'Church administrator & host coordinator',
              permission: 'Admin (manage requests, events, facility)',
              status: b('Connected (sample)', 'success'),
            },
          ],
        },
        {
          type: 'notice',
          tone: 'privacy',
          title: 'Organization boundaries',
          body: 'When you act on behalf of Grace Fellowship, church members and leaders only see your role for that church. Your private family academy details and personal worship musician payouts remain strictly private to you.',
        },
        {
          type: 'dialog',
          id: 'connect-org',
          title: 'Connect with a church or organization',
          body: 'Request affiliation with a church or ministry already participating in Gamo Studios.',
          fields: [
            { name: 'churchName', label: 'Church or ministry name', required: true },
            { name: 'city', label: 'City, State', required: true, half: true },
            { name: 'roleRequested', label: 'Your role at this organization', required: true, half: true },
            { name: 'leaderContact', label: 'Pastor or lead contact email for verification', type: 'email', required: true },
          ],
          confirmLabel: 'Send connection request (demo)',
          successText: 'Connection request simulated in preview only. No email was sent.',
        },
      ],
    },
    {
      slug: 'profile',
      title: 'Profile management',
      description: 'Your personal information shared across Gamo Studios programs.',
      blocks: [
        {
          type: 'form',
          span: 2,
          title: 'Personal information',
          fields: [
            { name: 'first', label: 'First name', value: 'Jordan', required: true, half: true },
            { name: 'last', label: 'Last name', value: 'Avery', required: true, half: true },
            { name: 'email', label: 'Email address', type: 'email', value: 'jordan.avery@example.org', required: true, half: true },
            { name: 'phone', label: 'Mobile phone (for service alerts)', value: '(555) 019-2834', half: true },
            { name: 'city', label: 'City', value: 'Phoenix', half: true },
            { name: 'state', label: 'State', value: 'AZ', half: true },
            { name: 'bio', label: 'Personal ministry bio', type: 'textarea', value: 'Worship musician and educator serving local churches with joy and reverence.' },
          ],
          submitLabel: 'Update profile (demo)',
          successText: 'Profile updated in this preview only. No database write occurred.',
        },
        {
          type: 'list',
          title: 'Account status',
          items: [
            { title: 'Personal account', body: 'Fictional demo identity', icon: 'user', badge: b('Sample', 'sample') },
            { title: 'Primary email', body: 'jordan.avery@example.org', icon: 'mail' },
            { title: 'Multi-factor authentication', body: 'Planned for functionality phase', icon: 'lock', badge: b('Planned', 'info') },
          ],
        },
      ],
    },
    {
      slug: 'notifications',
      title: 'Notifications & alerts',
      description: 'Recent activity across all your Gamo programs and channel preferences.',
      blocks: [
        {
          type: 'list',
          span: 2,
          title: 'Recent cross-program notifications',
          items: [
            { title: 'Worship rehearsal reminder', meta: 'Grace Fellowship (sample) · Today', body: 'Rehearsal confirmation needed for Oct 17 service.', icon: 'music', badge: b('Worship', 'pending') },
            { title: 'Academy lesson attendance recorded', meta: 'Ava Avery · Yesterday', body: 'Piano Foundations lesson 4 completed with Maya Thompson.', icon: 'school', badge: b('Academy', 'success') },
            { title: 'Event promotion preview available', meta: 'Harvest Night of Gospel · 2 days ago', body: 'Your proposed awareness package is ready to preview.', icon: 'ticket', badge: b('Live', 'info') },
            { title: 'Audio consultation scheduled', meta: 'Gamo Production · 4 days ago', body: 'Sanctuary sound assessment draft submitted.', icon: 'wrench', badge: b('Production', 'info') },
          ],
        },
        {
          type: 'settings',
          title: 'Notification preferences',
          groups: [
            {
              title: 'Email notifications',
              toggles: [
                { label: 'Worship assignment alerts', description: 'Immediate emails when a church requests or confirms you', on: true },
                { label: 'Academy lesson schedule updates', description: 'Reminders and schedule adjustments for learners', on: true },
                { label: 'Live event registration digests', description: 'Weekly summary of attendee registrations', on: true },
                { label: 'Monthly stewardship & newsletter', description: 'Gamo Studios nonprofit updates', on: false },
              ],
            },
            {
              title: 'SMS emergency alerts',
              toggles: [
                { label: 'Day-of Worship standby dispatch', description: 'Critical notifications when primary coverage changes', on: true },
                { label: 'Last-minute lesson rescheduling', description: 'Immediate weather or room changes', on: true },
              ],
            },
          ],
        },
      ],
    },
    {
      slug: 'settings',
      title: 'Account settings',
      description: 'Security, privacy and account management controls.',
      actions: [{ label: 'Delete account', dialog: 'delete-account', icon: 'alert' }],
      blocks: [
        {
          type: 'form',
          span: 2,
          title: 'Change password',
          description: 'Demonstration password change form. No password is stored.',
          fields: [
            { name: 'currentPassword', label: 'Current password', type: 'password', required: true },
            { name: 'newPassword', label: 'New password', type: 'password', required: true, half: true },
            { name: 'confirmPassword', label: 'Confirm new password', type: 'password', required: true, half: true },
          ],
          submitLabel: 'Update password (demo)',
          successText: 'Password change simulated in this preview only.',
        },
        {
          type: 'settings',
          title: 'Privacy and data',
          groups: [
            {
              title: 'Data sharing',
              toggles: [
                { label: 'Allow partner churches to find profile', description: 'Permits worship leaders to view your instruments and area', on: true },
                { label: 'Anonymized research participation', description: 'Helps us report community impact to supporters', on: true },
              ],
            },
          ],
        },
        {
          type: 'dialog',
          id: 'delete-account',
          title: 'Close Gamo account',
          body: 'This would remove your personal account, memberships, and unlink your learner and musician profiles.',
          fields: [
            { name: 'confirm', label: 'Type "DELETE" to confirm demo account removal', required: true },
          ],
          confirmLabel: 'Simulate account closure',
          successText: 'Account closure previewed. No real account exists to delete.',
        },
      ],
    },
  ],
};
