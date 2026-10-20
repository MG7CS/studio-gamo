/**
 * Shared by scripts/e2e/live-flow-server.ts and tests/e2e/live-flow.spec.ts: the ports and identities of the
 * Gamo Live end-to-end servers. Ports 4328–4330 (never 4324/4326, the dev servers). Every value is a throwaway
 * for servers that answer only on 127.0.0.1.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `FLOW_PORT_BASE` (default 4328) lets several spec files run their own servers side by side (live = base,
 * admin = base + 1, mail = base + 2); the Playwright config and every spec read the same values.
 */
const BASE = Number(process.env.FLOW_PORT_BASE ?? 4328);
if (!Number.isInteger(BASE) || BASE < 1024 || BASE > 65000)
  throw new Error('FLOW_PORT_BASE must be a port number');
export const FLOW_LIVE_PORT = BASE;
export const FLOW_ADMIN_PORT = BASE + 1;
/** A tiny server that lists the emails the workers tried to send (the Resend API is answered locally). */
export const FLOW_MAIL_PORT = BASE + 2;
export const FLOW_LIVE_ORIGIN = `http://127.0.0.1:${FLOW_LIVE_PORT}`;
export const FLOW_ADMIN_ORIGIN = `http://127.0.0.1:${FLOW_ADMIN_PORT}`;
export const FLOW_MAIL_ORIGIN = `http://127.0.0.1:${FLOW_MAIL_PORT}`;
/** One folder per server set, so parallel runs never share or delete each other's key. */
export const FLOW_KEY_DIR = join(tmpdir(), `gamo-live-flow-e2e-${BASE}`);
export const FLOW_ACCESS_KEY_FILE = join(FLOW_KEY_DIR, 'access-key.pem');

export interface CapturedEmail {
  to: string | string[];
  subject: string;
  text: string;
}
