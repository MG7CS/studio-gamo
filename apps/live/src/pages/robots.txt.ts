import { robotsRoute } from '@gamo/site/lib/crawlers';

export const prerender = false;

// /api/ and /account stay disallowed for every crawler; registration and manage pages are personal.
export const GET = robotsRoute('live', ['/registrations/', '/events/*/register', '/organizer']);
