/**
 * Shared by scripts/e2e/live-flow-server.ts and tests/e2e/live-flow.spec.ts: the ports and identities of the
 * Gamo Live end-to-end servers. Ports 4328–4330 (never 4324/4326, the dev servers). Every value is a throwaway
 * for servers that answer only on 127.0.0.1.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FLOW_LIVE_PORT = 4328;
export const FLOW_ADMIN_PORT = 4329;
/** A tiny server that lists the emails the workers tried to send (the Resend API is answered locally). */
export const FLOW_MAIL_PORT = 4330;
export const FLOW_LIVE_ORIGIN = `http://127.0.0.1:${FLOW_LIVE_PORT}`;
export const FLOW_ADMIN_ORIGIN = `http://127.0.0.1:${FLOW_ADMIN_PORT}`;
export const FLOW_MAIL_ORIGIN = `http://127.0.0.1:${FLOW_MAIL_PORT}`;
export const FLOW_ACCESS_KEY_FILE = join(tmpdir(), 'gamo-live-flow-e2e', 'access-key.pem');

export interface CapturedEmail {
  to: string | string[];
  subject: string;
  text: string;
}
