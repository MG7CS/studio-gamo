# Gamo Live Editorial Import & Launch Verification Report (`2026-10-15`)

- **Source Catalog:** [`gamo_live_verified_events_2026-10-15.json`](../gamo_live_verified_events_2026-10-15.json) (`data/gamo_live_verified_events_2026-10-15.json`)
- **Publisher Identity:** `Gamo Live Listings` (`org_gamo_live_listings` / `gamo-live-listings`, `editorial-listings@gamo.live`, `organizer_profiles.ticketing_authorized_at = NULL`)
- **Listing Type & Ticketing Mode:** `listing_type = 'external_discovery'`, `admission_type = 'external'`, `external_only = 1`
- **Structured JSON Audit Output:** [`docs/GAMO_LIVE_IMPORT_REPORT_2026-10-15.json`](./GAMO_LIVE_IMPORT_REPORT_2026-10-15.json)

---

## 1. Editorial Triage Summary

| Metric | Count | Details |
| :--- | :---: | :--- |
| **Total Candidate Records** | **21** | Evaluated against `2026-10-15` reference date, venue completeness, HTTPS destination validity, and editorial notes |
| **Approved & Published (`published`)** | **18** | Live on `/`, `/events`, `/events/<metro-slug>`, `/events/<slug>`, `/venues`, and `/sitemap.xml` |
| **Held in Editorial Review (`verified`)** | **2** | Stored in D1 with `status = 'draft'` and `editorial_status = 'verified'`; excluded from public discovery until TicketWeb destination URLs are manually revalidated |
| **Rejected / Incomplete (`rejected`)** | **1** | Skipped (`josiah-queen-duluth-2027-04-18` has `venue.name = null`, `external_destination.url = null`, and `publish_eligible_after_review = false`) |

---

## 2. Event-by-Event Disposition Table (All 21 Candidates)

| # | Import Key / Slug | Event Title | Performers | Metro (`metro_slug`) | Venue & City/State | Local Date & Time | External Destination (`https://`) | Provider / Kind | Disposition | Reason |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `cain-phoenix-2026-11-07` | **CAIN Live and In Worship Tour with bodie** *(Featured)* | CAIN, bodie | `phoenix-az` | Dream City Church · 13613 N Cave Creek Rd, Phoenix, AZ 85022 | `2026-11-07` `19:00` (`America/Phoenix`) | `https://www.ticketweb.com/event/cain-live-and-in-worship-dream-city-church-tickets/14954663?pl=TPR` | TicketWeb (`official_ticket_page`) | **PUBLISHED** | Verified venue, street address, schedule, performers, and HTTPS TicketWeb page confirmed. |
| 2 | `cece-winans-phoenix-2026-12-15` | **Christmas with CeCe Winans featuring Angie & Debbie Winans** | CeCe Winans, Angie Winans, Debbie Winans | `phoenix-az` | Arizona Financial Theatre · Phoenix, AZ | `2026-12-15` `19:00` (`America/Phoenix`) | `https://www.ticketmaster.com/event/190064E6D5666C29` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 3 | `elevation-phoenix-2027-03-06` | **Elevation Worship & Steven Furtick** | Elevation Worship, Steven Furtick | `phoenix-az` | Mortgage Matchup Center · Phoenix, AZ | `2027-03-06` `19:00` (`America/Phoenix`) | `https://www.ticketmaster.com/elevation-worship-steven-furtick-phoenix-arizona-03-06-2027/event/19006524CE9A8A47` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 4 | `josiah-queen-glendale-2027-05-01` | **Damascus Road Tour with Josiah Queen** | Josiah Queen | `phoenix-az` | Desert Diamond Arena · Glendale, AZ | `2027-05-01` `19:00` (`America/Phoenix`) | `https://www.ticketmaster.com/event/190065274189B911` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 5 | `cece-winans-duluth-2026-10-23` | **CeCe Winans — COME WORSHIP! Tour** | CeCe Winans, Charity Gayle, Red Worship, Terrian | `atlanta-ga` | Gas South Arena · Duluth, GA | `2026-10-23` `19:00` (`America/New_York`) | `https://www.ticketmaster.com/event/0E006454A758C390` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 6 | `crowder-woodstock-2026-10-30` | **Crowder LIVE!** | Crowder, Rend Collective, Benjamin William Hastings | `atlanta-ga` | First Baptist Woodstock · 11905 Highway 92, Woodstock, GA 30188 | `2026-10-30` `19:00` (`America/New_York`) | `https://fbcwoodstock.churchcenter.com/registrations/events/3825163` | Official Event Page (`organizer_event_page`) | **PUBLISHED** | Verified church venue, street address, schedule, performers, and HTTPS Church Center registration page confirmed. |
| 7 | `pat-barrett-atlanta-2026-11-22` | **Pat Barrett — I've Got A Fire Tour** | Pat Barrett, Matt Crocker | `atlanta-ga` | Grace Midtown Church · Atlanta, GA | `2026-11-22` `19:00` (`America/New_York`) | `https://www.ticketweb.com/event/ive-got-a-fire-tour-grace-midtown-church-tickets/14873763?pl=TPR` | TicketWeb (`official_ticket_page`) | **HELD (`verified`)** | Held in editorial review queue (`status='draft'`, not public): `editorial_notes` states TicketWeb destination could not be fetched directly during research and must be revalidated before publication. |
| 8 | `chapman-powder-springs-2026-12-06` | **Steven Curtis Chapman — The Music of Christmas Tour** | Steven Curtis Chapman | `atlanta-ga` | Burnt Hickory Baptist Church · Powder Springs, GA | `2026-12-06` `19:00` (`America/New_York`) | `https://www.ticketweb.com/event/steven-curtis-chapman-the-music-burnt-hickory-baptist-church-tickets/15045723?theme=tprlive` | TicketWeb (`official_ticket_page`) | **HELD (`verified`)** | Held in editorial review queue (`status='draft'`, not public): `editorial_notes` states TicketWeb destination could not be fetched directly during research and must be revalidated before publication. |
| 9 | `cece-winans-orlando-2026-10-27` | **CeCe Winans — COME WORSHIP! Tour** | CeCe Winans, Charity Gayle, Red Worship, Terrian | `orlando-fl` | Addition Financial Arena · Orlando, FL | `2026-10-27` `19:00` (`America/New_York`) | `https://www.ticketmaster.com/event/22006453997A37D4` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 10 | `crowder-longwood-2026-11-03` | **Crowder LIVE!** | Crowder, Rend Collective | `orlando-fl` | Northland Church · Longwood, FL | `2026-11-03` `19:00` (`America/New_York`) | `https://www.ticketmaster.com/event/220064C4B52543F9` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 11 | `bethel-music-nashville-2026-10-25` | **Bethel Music 2026 Tour** | Bethel Music | `nashville-tn` | Brooklyn Bowl Nashville · Nashville, TN | `2026-10-25` `19:00` (`America/Chicago`) | `https://www.ticketmaster.com/event/1B00638BB4B85A6E` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 12 | `franni-cash-nashville-2026-11-17` | **Franni Cash — Here I Am Tour** | Franni Cash | `nashville-tn` | Cannery Hall — The Mil · 1 Cannery Row, Nashville, TN 37203 | `2026-11-17` `19:00` (`America/Chicago`) | `https://www.axs.com/events/1609817/franni-cash-tickets` | AXS (`official_ticket_page`) | **PUBLISHED** | Verified venue, street address, schedule, performers, and HTTPS AXS page confirmed. |
| 13 | `tommee-profitt-nashville-2026-12-12` | **Tommee Profitt — The Birth of a King** | Tommee Profitt | `nashville-tn` | Bridgestone Arena · Nashville, TN | `2026-12-12` `19:30` (`America/Chicago`) | `https://www.ticketmaster.com/event/1B006371C00BC350?did=king` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule (Saturday Dec 12, 7:30 PM CST), performers, and HTTPS Ticketmaster page confirmed. |
| 14 | `tommee-profitt-nashville-2026-12-13` | **Tommee Profitt — The Birth of a King** | Tommee Profitt | `nashville-tn` | Bridgestone Arena · Nashville, TN | `2026-12-13` `19:00` (`America/Chicago`) | `https://www.ticketmaster.com/event/1B006371C013C35D?did=king` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule (Sunday Dec 13, 7:00 PM CST — distinct second performance), performers, and HTTPS Ticketmaster page confirmed. |
| 15 | `blessing-offor-houston-2026-10-20` | **Blessing Offor — Heart So Real Tour Pt. 2** | Blessing Offor | `houston-tx` | White Oak Music Hall — Upstairs · 2915 N Main St, Houston, TX 77009 | `2026-10-20` `19:00` (`America/Chicago`) | `https://www.livenation.com/event/G5dIZ_23HWl7l/blessing-offor-heart-so-real-tour-pt-2` | Live Nation (`official_ticket_page`) | **PUBLISHED** | Verified venue, street address, schedule, performers, and HTTPS Live Nation page confirmed. |
| 16 | `blessing-offor-los-angeles-2026-10-28` | **Blessing Offor — Heart So Real Tour Pt. 2** | Blessing Offor, Ryan Ellis | `los-angeles-ca` | The Moroccan Lounge · Los Angeles, CA | `2026-10-28` `18:30` (`America/Los_Angeles`) | `https://www.livenation.com/event/vvG10Z_2d0v-9C/blessing-offor-heart-so-real-tour-pt-2` | Live Nation (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Live Nation page confirmed. |
| 17 | `elevation-inglewood-2027-03-07` | **Elevation Worship & Steven Furtick** | Elevation Worship, Steven Furtick, Elevation Rhythm | `los-angeles-ca` | Kia Forum · Inglewood, CA | `2027-03-07` `19:00` (`America/Los_Angeles`) | `https://www.ticketmaster.com/elevation-worship-steven-furtick-inglewood-california-03-07-2027/event/09006528E7F4DAA3` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 18 | `christmas-cece-seattle-2026-12-10` | **Christmas with CeCe Winans featuring Angie & Debbie Winans** | CeCe Winans, Angie Winans, Debbie Winans | `seattle-wa` | WAMU Theater · Seattle, WA | `2026-12-10` `19:00` (`America/Los_Angeles`) | `https://www.ticketmaster.com/christmas-with-cece-winans-featuring-angie-seattle-washington-12-10-2026/event/0F0064E2D49DBD86` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 19 | `revelation-nights-brooklyn-2026-10-20` | **Revelation Nights** | Revelation Church LA | `new-york-ny` | Barclays Center · 620 Atlantic Ave, Brooklyn, NY 11217 | `2026-10-20` `19:00` (`America/New_York`) | `https://www.barclayscenter.com/events/detail/revelation-nights-2026` | Venue Event Page (`venue_event_page`) | **PUBLISHED** | Verified arena venue, street address, schedule, performers, and HTTPS Barclays Center venue event page confirmed (`worship_event` normalized to `worship`). |
| 20 | `elevation-okc-2026-10-17` | **Elevation Worship & Steven Furtick — Fall Tour 2026** | Elevation Worship, Steven Furtick | `oklahoma-city-ok` | Paycom Center · Oklahoma City, OK | `2026-10-17` `19:00` (`America/Chicago`) | `https://www.ticketmaster.com/elevation-worship-steven-furtick-fall-tour-2026-oklahoma-city-10-17-2026/event/0C0064962FFCC54D` | Ticketmaster (`official_ticket_page`) | **PUBLISHED** | Verified venue, schedule, performers, and HTTPS Ticketmaster page confirmed. |
| 21 | `josiah-queen-duluth-2027-04-18` | **Josiah Queen — Damascus Road Tour** | Josiah Queen | `atlanta-ga` | *Missing Venue* · Duluth, GA | `2027-04-18` `19:00` (`America/New_York`) | `null` | `publisher_event_page` | **REJECTED** | Candidate has `venue.name: null`, `external_destination.url: null`, and `publish_eligible_after_review: false`. Excluded from public discovery. |

---

## 3. Repeatable CLI Publishing Workflow

The editorial CLI in [`scripts/live/editorial-cli.ts`](../scripts/live/editorial-cli.ts) defaults to `--dry-run` unless `--apply` is explicitly passed, and refuses `--env production --apply` without `--confirm-production`.

```bash
# 1. Provision internal 'Gamo Live Listings' publisher identity
pnpm live:publisher:provision --env local --dry-run
pnpm live:publisher:provision --env local --apply

# 2. Import and triage the verified JSON catalog
pnpm live:events:import --file ./gamo_live_verified_events_2026-10-15.json --env local --dry-run
pnpm live:events:import --file ./gamo_live_verified_events_2026-10-15.json --env local --apply

# 3. Publish only editorially approved events (holding unverified/incomplete records)
pnpm live:events:publish --env local --only-approved --dry-run
pnpm live:events:publish --env local --only-approved --apply

# 4. Optional single-record editorial transition (approve, hold, cancel, archive)
tsx scripts/live/editorial-cli.ts review --import-key pat-barrett-atlanta-2026-11-22 --decision approved --notes "TicketWeb URL manually revalidated" --env local --apply
```

---

## 4. Production Deployment Checklist & Owner Actions

Per `AGENTS.md` and `SECURITY.md`, production deployment and remote D1 mutations are never executed autonomously without explicit owner approval. When ready to promote `apps/live` to staging/production:

1. **Apply Migration `0009_live_external_discovery.sql` to Remote D1:**
   ```bash
   wrangler d1 migrations apply gamo-platform --remote
   ```
2. **Provision Publisher & Publish Approved Catalog on Production:**
   ```bash
   pnpm live:publisher:provision --env production --dry-run
   pnpm live:events:import --file ./gamo_live_verified_events_2026-10-15.json --env production --dry-run
   pnpm live:events:publish --env production --only-approved --dry-run
   ```
3. **Cloudflare Pages / Worker Bindings for `apps/live` (`gamo.live`):**
   - `DB`: Bound to D1 database `gamo-platform`
   - `ASSETS`: Bound to R2 bucket `gamo-media`
   - `ENVIRONMENT`: `"production"`
   - `ALLOW_DEMO_SESSION`: `"false"`
   - `ALLOW_AUTH_SIMULATION`: `"false"`
   - `SESSION_SECRET`: 32+ byte secret via `wrangler secret put SESSION_SECRET`
4. **External Ticketing & Stripe Boundary:**
   - External discovery listings (`listing_type = 'external_discovery'`) never invoke Stripe or internal Gamo checkout; SQLite triggers (`external_event_block_tiers`, `external_event_block_holds`, `external_event_block_orders`, `external_event_block_tickets`, `external_event_block_settlements`) enforce this at the database layer.
