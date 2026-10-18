export interface PlatformBrandEnv {
  PLATFORM_BRAND?: string;
  PLATFORM_BRAND_TAGLINE?: string;
  PLATFORM_PRIMARY_DOMAIN?: string;
  PLATFORM_IS_LIVE_DOMAIN?: string;
  PLATFORM_SUPPORT_EMAIL?: string;
  PLATFORM_SENDER_NAME?: string;
  PLATFORM_SENDER_EMAIL?: string;
  PLATFORM_LOGO_MARK?: string;
}

export interface PlatformBrandConfig {
  configToken: 'PLATFORM_BRAND';
  displayName: string;
  logoMark: string;
  tagline: string;
  operatingDivision: 'Gamo Live';
  parentOrganization: 'Gamo Studios';
  primaryDomain: string;
  isPlaceholderDomain: boolean;
  canonicalOrigin: string;
  supportEmail: string;
  emailSenderName: string;
  emailSenderAddress: string;
  socialMetadata: {
    siteName: string;
    twitterCard: 'summary_large_image';
    defaultDescription: string;
  };
  ticketPassHeader: string;
  receiptHeader: string;
  operatorDisclosure: string;
  paymentDisclosure: string;
}

const DEFAULT_DISPLAY_NAME = 'Gamo Live';
const DEFAULT_TAGLINE = 'Christian Concerts, Worship Nights & Live Gatherings';
const DEFAULT_DOMAIN = 'live.example.invalid';

function sanitizeDisplayName(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.toUpperCase() === 'PLATFORM_BRAND') {
    return DEFAULT_DISPLAY_NAME;
  }
  return trimmed;
}

function deriveLogoMark(displayName: string, explicitMark?: string): string {
  const trimmedMark = explicitMark?.trim();
  if (trimmedMark && trimmedMark.toUpperCase() !== 'PLATFORM_BRAND') {
    return trimmedMark.slice(0, 3).toUpperCase();
  }
  const words = displayName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

export function getPlatformBrandConfig(env: PlatformBrandEnv = {}): PlatformBrandConfig {
  const displayName = sanitizeDisplayName(env.PLATFORM_BRAND);
  const tagline = env.PLATFORM_BRAND_TAGLINE?.trim() || DEFAULT_TAGLINE;
  const primaryDomain = env.PLATFORM_PRIMARY_DOMAIN?.trim() || DEFAULT_DOMAIN;
  const isPlaceholderDomain = env.PLATFORM_IS_LIVE_DOMAIN !== 'true';
  const canonicalOrigin = isPlaceholderDomain
    ? 'http://localhost:4324'
    : `https://${primaryDomain.replace(/^https?:\/\//, '')}`;
  const supportEmail = env.PLATFORM_SUPPORT_EMAIL?.trim() || 'support@live.gamostudios.local';
  const emailSenderName = sanitizeDisplayName(env.PLATFORM_SENDER_NAME || displayName);
  const emailSenderAddress = env.PLATFORM_SENDER_EMAIL?.trim() || 'tickets@live.gamostudios.local';
  const logoMark = deriveLogoMark(displayName, env.PLATFORM_LOGO_MARK);

  return {
    configToken: 'PLATFORM_BRAND',
    displayName,
    logoMark,
    tagline,
    operatingDivision: 'Gamo Live',
    parentOrganization: 'Gamo Studios',
    primaryDomain,
    isPlaceholderDomain,
    canonicalOrigin,
    supportEmail,
    emailSenderName,
    emailSenderAddress,
    socialMetadata: {
      siteName: displayName,
      twitterCard: 'summary_large_image',
      defaultDescription:
        'Discover Christian concerts, worship nights, gospel performances, conferences, and community gatherings nationwide.',
    },
    ticketPassHeader: `${displayName} · Official Admission Pass`,
    receiptHeader: `${displayName} · Order Confirmation & Receipt`,
    operatorDisclosure:
      'Operated by the Gamo Live division of Gamo Studios, a Christian, mission-driven Public Benefit Corporation.',
    paymentDisclosure:
      'Ticket orders and booking terms are facilitated by the Gamo Live division of Gamo Studios. Organizer proceeds, performer payables, agent commissions, processing costs, and platform administrative allocations are tracked as separate line items. The platform is not a bank, escrow agent, or fiduciary.',
  };
}

export async function resolvePlatformBrandConfig(locals?: unknown): Promise<PlatformBrandConfig> {
  let runtimeEnv: PlatformBrandEnv = {};
  try {
    const cf = await import(/* @vite-ignore */ 'cloudflare:workers');
    if (cf && typeof cf.env === 'object' && cf.env !== null) {
      runtimeEnv = cf.env as PlatformBrandEnv;
    }
  } catch {
    try {
      const legacy = (locals as { runtime?: { env?: PlatformBrandEnv } } | undefined)?.runtime?.env;
      if (legacy && typeof legacy === 'object') {
        runtimeEnv = legacy;
      }
    } catch {
      // No legacy runtime env either; fall back to defaults below.
    }
  }
  return getPlatformBrandConfig(runtimeEnv);
}
