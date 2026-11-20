import { siteUrl } from '@studio-gamo/ui/lib/sites';

/** The Register link for an instrument: the simple interest form, with the instrument ticked. */
export function registerUrl(instrumentSlug: string): string {
  return `${siteUrl('web', '/academy/interest')}?instrument=${encodeURIComponent(instrumentSlug)}`;
}
