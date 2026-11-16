/**
 * Gamo Studios platform brand configuration (display name, sender, disclosures) shared by every app.
 * Overridable per Worker through the `PLATFORM_*` variables.
 */
export interface PlatformBrandEnv {
  PLATFORM_BRAND?: string;
  PLATFORM_BRAND_TAGLINE?: string;
  PLATFORM_PRIMARY_DOMAIN?: string;
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
  operatingDivision: 'Gamo Studios';
  /** Parent organization */
  parentOrganization: 'Gamo Studios';
  /** Configured primary domain */
  primaryDomain: string;
  /** True when no `PLATFORM_PRIMARY_DOMAIN` is configured (canonical origin falls back to localhost) */
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
  /** Header label for confirmation passes (kept for compatibility; no ticketing remains) */
  ticketPassHeader: string;
  /** Header label used on checkout summaries and order receipts */
  receiptHeader: string;
  /** Accurate legal/operator disclosure for legal, privacy, payment, and transactional footer contexts */
  operatorDisclosure: string;
  /** Accurate financial & non-escrow disclosure for checkout and receipts */
  paymentDisclosure: string;
}

const DEFAULT_DISPLAY_NAME = 'Gamo Studios';
const DEFAULT_TAGLINE = 'Worship, Academy & Production for Churches';
const DEFAULT_DOMAIN = 'gamostudio.org';

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
  const isPlaceholderDomain = !env.PLATFORM_PRIMARY_DOMAIN?.trim();
  const canonicalOrigin = isPlaceholderDomain
    ? 'http://localhost:4321'
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
    operatingDivision: 'Gamo Studios',
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
        'Gamo Studios serves churches with worship musicians, music lessons through Gamo Academy, and production support.',
    },
    ticketPassHeader: `${displayName} · Confirmation`,
    receiptHeader: `${displayName} · Order Confirmation & Receipt`,
    operatorDisclosure: 'Operated by Gamo Studios, a Christian, mission-driven Public Benefit Corporation.',
    paymentDisclosure:
      'Payments are facilitated by Gamo Studios. Musician and instructor pay, processing costs, and any administrative allocation are tracked as separate line items. Gamo Studios is not a bank, escrow agent, or fiduciary.',
  };
}
