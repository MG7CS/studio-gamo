# Door scanning, venue maps and the organizer dashboard (Gamo Live)

Design of record: `docs/design/identity-and-ticketing.md` §5.3, §5.6, T-09, T-10. Decisions D-200–D-206 in `docs/CLEANUP_LOG.md`. Merge note: B's `docs/TICKETING.md` and this file are meant to be combined by the lead.

## What exists

| Area | Where |
| --- | --- |
| Scanner sessions (link + PIN, no account) | `packages/domain/src/services/ticketing/scanner-sessions.ts`, `/organizer/events/<id>/scanners`, `/scan/<event>/unlock` |
| Scanning | `scanning.ts` (`scanTicket`, `lookupTickets`, `overrideAdmit`, `eventHeadcount`), `POST /api/scanner/{scan,lookup,override}`, `GET /api/scanner/headcount` |
| Scanner PWA | `/scan/<event>`, `apps/live/src/scripts/scanner/*`, `public/scan/sw.js`, `public/scan/manifest.webmanifest` |
| Offline | `manifest.ts`, `GET /api/scanner/manifest`, `POST /api/scanner/sync` |
| Door sales | `scanning-door-sales.ts` (`DoorIssuer`), `/scan/<event>/door` |
| Venue maps | `venue-maps.ts`, `venue-maps-svg.ts`, `/organizer/events/<id>/venue-map`, `GET /api/venue-maps/{id}`, buyer component `apps/live/src/components/venue/SectionPicker.astro` |
| Dashboard | `dashboard.ts`, `/organizer`, `/organizer/events/<id>` (+ `/orders`, `/scans`, `/export`) |

## How a scan is decided

1. The scanner device (cookie) or an organizer with `scan_tickets` is bound to **one event**; another event id is refused (403 `NOT_ALLOWED`).
2. The code is parsed (`GL1.…` or legacy `gamt_…`), its MAC is checked in constant time against the ticket's salt and event, and the version is compared.
3. Event cancelled, scanning window (`scan_opens_minutes_before`), multi-day `valid_days_json` against the venue-local day, and zone are checked.
4. The **database** admits: one conditional presence upsert per ticket and day, then the scan row's result is computed in SQL. Two scanners racing on one ticket get one `admitted` and one `already_inside`. The same `client_scan_id` twice is recorded once.
5. Results show first name + last initial, category, section/zone only. Manual lookup (supervisor or organizer) shows the full name and a masked email, and every lookup is logged.

## Integration notes for the lead

- **Section picker (Agent B):** `getSectionAvailability(db, eventId)` from `@gamo/domain/scanner`; embed `<SectionPicker availability={…} />` inside the checkout form; it posts `sectionId` as a normal radio field. The hold insert re-validates (triggers are the authority).
- **Door sales:** swap `issueDoorTicketsLocal` for B's `issueDoorTickets` (same `DoorIssuer` signature) in `sellAtDoor`'s default; the TODO for emailing a door ticket is in `scanning-door-sales.ts`.
- **Refunds link:** `apps/live/src/pages/organizer/events/[id]/orders.astro` has `REFUNDS_ACTION_PATH` (null until B's refund page exists).
- **Legacy redirect:** `/organizer/*` no longer redirects to `/workspaces` (only `/organizer/scan` does).

## Offline behaviour

- The phone downloads the event manifest (ticket id parts, versions, SHA-256 of each QR MAC, category, zone, status, presence, first name + initial; **no emails or full names**) into IndexedDB while online and refreshes it every 5 minutes.
- Offline, the phone verifies codes against the manifest, shows a provisional result marked "Offline", and queues each scan (client scan id + device time) in IndexedDB. Rules match the server (window, days, zone, re-entry limit), counting this phone's own queued scans.
- When the connection returns (or every 30 s), the queue is sent to `POST /api/scanner/sync` and replayed in device-time order. The server decides with the same statements. If another phone admitted the same ticket first, the later scan is `duplicate_offline`; the scanner shows "N scans need review" and the organizer sees them under **Scan log → Offline conflicts only**.
- First scan wins: online by receipt order, offline by earliest sync, flagged for review. Organizer-account scans (no scanner link) are online only.
- The service worker (`/scan/sw.js`, scope `/scan/`) caches the scanner page and its build assets so the app opens without signal. A phone must open the scanner once online first.

## Door staff — one page

**Before the doors open**
1. Open the link the organizer sent you and type the 6-digit PIN. Allow the camera when asked. Keep the page open; add it to your home screen if you like.
2. Check the name at the top right matches your entrance (for example "North door").

**Scanning**
1. Choose **Entry** or **Exit** (if your scanner allows both).
2. Tap **Start camera** and hold the ticket inside the frame. No camera? Type the code under the QR and tap **Check ticket**.
3. Read the big result: **Go** (green, admitted) — let them in. **Check** (amber) — read the message; do not admit twice. **Stop** (red) — do not admit; send the guest to the help desk.
4. The numbers at the bottom show people inside now, admitted today and capacity.

**If something goes wrong**
- *Phone died or code won't scan:* a supervisor taps **Find a guest**, searches by name, email or order reference, and admits with a written reason.
- *"Already inside":* the ticket was scanned earlier (the message says when and where). Do not admit; call your supervisor.
- *"Wrong entrance":* send the guest to the entrance named in the message.
- *"This scanner link has ended":* ask the organizer for a new link.
- *No signal:* keep scanning. Results say "Offline"; they sync when the connection returns. A note "N scans need review" means tell your supervisor.
- *Five wrong PINs lock the link for 15 minutes.* Ask the organizer for help.

Sound and vibration are off by default; turn them on under "Sound and vibration".

## Not built / caveats

- Individual seats (Phase 2). Door sales never take cards. Door tickets are not emailed yet (hook for B).
- Organizer-account scanning has no offline mode.
- A `not_valid_today` scan result does not exist; multi-day passes on the wrong day answer `not_open_yet` with the valid days (D-203).
