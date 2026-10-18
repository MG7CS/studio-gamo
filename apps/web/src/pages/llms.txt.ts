import type { APIRoute } from 'astro';
import { siteOrigin } from '@studio-gamo/ui/lib/sites';
import { textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Plain-text guide for AI assistants. Descriptions mirror each program's own page copy.
export const GET: APIRoute = () => {
  const web = siteOrigin('web');
  const body = `# Gamo Studios

> Gamo Studios is a Christian, mission-driven Public Benefit Corporation that brings together four connected programs serving churches, musicians, students, and families: preparing worship teams, teaching instruments, sharing Christian gatherings nationwide, and supporting technical ministry.

## Programs

- [Gamo Worship](${siteOrigin('worship')}): a developing program helping churches find prepared, vetted musicians, and musicians serve congregations with dependable scheduling and fair pay.
- [Gamo Academy](${siteOrigin('academy')}): friendly, patient music lessons for students and families, private or in small groups, online or close to home, including planned church-hosted and sponsored programs.
- [Gamo Live](${siteOrigin('live')}): concerts, worship nights and gatherings, with every listing reviewed before publishing. Browse events at ${siteOrigin('live')}/events.
- [Gamo Production](${siteOrigin('production')}): a proposed program helping churches grow in worship audio, video, lighting and livestreaming, and the volunteers who serve behind the board.

## About Gamo Studios

- [Our mission](${web}/mission): how the four programs connect.
- [Get started](${web}/get-started): find the right program for you.
- [Get involved](${web}/get-involved): practical ways to take part.
- [Partnership inquiries](${web}/partners): how churches and community organizations can start a conversation.
- [FAQ](${web}/faq): common questions about the programs.
- [Contact](${web}/contact): reach the Gamo Studios team.
`;
  return textResponse(body);
};
