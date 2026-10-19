import { renderSVG } from 'uqr';

/** Inline SVG of a QR code for the given text (no third-party service, no external requests). */
export function qrSvg(text: string): string {
  return renderSVG(text, { ecc: 'M', border: 2, pixelSize: 6 });
}

/** What a QR code carries: the version marker plus the check-in code (see `checkIn`). */
export const qrPayload = (checkinCode: string): string => `GL1.${checkinCode}`;
