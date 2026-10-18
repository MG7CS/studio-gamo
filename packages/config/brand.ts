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
  /** Internal configuration key token */
  configToken: 'PLATFORM_BRAND';
  /** Public-facing consumer software brand display name (never literal 'PLATFORM_BRAND') */
  displayName: string;
  /** Monogram or logo mark text */
  logoMark: string;
  /** Public tagline for discovery & social cards */
  tagline: string;
  /** Internal operating division */
  operatingDivision: 'Gamo Live';
  /** Parent organization */
  parentOrganization: 'Gamo Studios';
  /** Configured primary domain (treated as non-live placeholder until PLATFORM_IS_LIVE_DOMAIN='true') */
  primaryDomain: string;
  /** True until founder approves and activates a live production domain */
  isPlaceholderDomain: boolean;
  /** Canonical origin URL for metadata and pass generation */
  canonicalOrigin: string;
  /** Public support contact email */
  supportEmail: string;
  /** Transactional email From display name */
  emailSenderName: string;
  /** Transactional email From address */
  emailSenderAddress: string;
  /** Social / OpenGraph metadata defaults */
  socialMetadata: {
    siteName: string;
    twitterCard: 'summary_large_image';
    defaultDescription: string;
  };
  /** Header label used on QR admission passes and printable ticket PDFs */
  ticketPassHeader: string;
  /** Header label used on checkout summaries and order receipts */
  receiptHeader: string;
  /** Accurate legal/operator disclosure for legal, privacy, payment, and transactional footer contexts */
  operatorDisclosure: string;
  /** Accurate financial & non-escrow disclosure for checkout, settlements, and booking agreements */
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
  const supportEmail = env.PLATFORM_SUPPORT_EMAIL?.trim() || 'hello@gamostudio.org';
  const emailSenderName = sanitizeDisplayName(env.PLATFORM_SENDER_NAME || displayName);
  const emailSenderAddress = env.PLATFORM_SENDER_EMAIL?.trim() || 'hello@gamostudio.org';
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
