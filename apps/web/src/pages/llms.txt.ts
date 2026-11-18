import type { APIRoute } from 'astro';
import { siteOrigin } from '@studio-gamo/ui/lib/sites';
import { textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Plain-text guide for AI assistants. Descriptions mirror each program's own page copy.
export const GET: APIRoute = () => {
  const web = siteOrigin('web');
  const body = `# Gamo Studios

> Gamo Studios is a Christian, mission-driven Public Benefit Corporation that brings together three connected programs serving students, families, churches and musicians: teaching instruments, preparing worship teams and supporting technical ministry.

## Programs

- [Gamo Academy](${siteOrigin('academy')}): friendly, patient music lessons for students and families, private or in small groups. "Learn to Play the Instrument You Love."
- [Gamo Worship](${siteOrigin('worship')}): helps churches find prepared, vetted worship musicians, and helps musicians serve congregations with dependable scheduling and fair pay shown as its own line item.
- [Gamo Production](${siteOrigin('production')}): helps churches grow in worship audio, video, lighting and livestreaming, with a proposed software area for church websites, apps and email, and hands-on training for the volunteers who serve behind the board.

## About Gamo Studios

- [Our mission](${web}/mission): how the three programs connect.
- [Get started](${web}/get-started): find the right program for you.
- [Get involved](${web}/get-involved): practical ways to take part.
- [Partnership inquiries](${web}/partners): how churches and community organizations can start a conversation.
- [FAQ](${web}/faq): common questions about the programs.
- [Contact](${web}/contact): reach the Gamo Studios team.
`;
  return textResponse(body);
};
