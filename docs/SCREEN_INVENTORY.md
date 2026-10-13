# Gamo Studios UI Screen Inventory

## Global Brand (`apps/web`)
- [x] `/` (Homepage / Root Hub)

## Worship Application (`apps/worship`)
- [x] `/` (Worship index - Not required? Using web)
- [x] `/hire` (Church posting wizard)
- [x] `/apply` (Musician application flow)
- [x] `/apply/identity` (Identity capture demo)
- [x] `/admin` (Worship dispatch/admin radar)
- [x] `/admin/assign` (Assignment flow)
- [x] `/check-in/[id]` (Check-in and standby demo)

## Academy Application (`apps/academy`)
- [x] `/` (Academy listing / courses)
- [x] `/lessons` (Lesson booking and details)
- [x] `/host-apply` (Host application flow)

## Live Application (`apps/live`)
- [x] `/` (Events listing / discovery)
- [x] `/events/[id]` (Event details and tier selection)
- [x] `/checkout` (Stripe sandbox checkout flow)
- [x] `/ticket` (Generated ticket / QR)
- [x] `/organizer` (Organizer dashboard)

## Production Application (`apps/production`)
- [x] `/` (Production portfolio / services)
- [x] `/contact` (Consultation intake)

## Global Admin Hub (`apps/admin`)
- [x] `/` (Admin dashboard / quick stats)
- [x] `/legal` (Legal document management)

## Planned — Gamo Live, Church Partners & dynamic homepage (Not started)
See [GAMO_LIVE_AND_PARTNERS.md](GAMO_LIVE_AND_PARTNERS.md). Desktop + mobile, plus empty/loading/error/validation states.

**Global (`apps/web`)**
- [ ] `/` dynamic hero spotlight (rotating labeled example slides, controls, reduced-motion state)
- [ ] `/partners` (Gamo Church Partners overview & benefits)
- [ ] `/partners/join` (membership onboarding — demo, pricing marked proposed)
- [x] Homepage How It Works pill (For Churches / Join the Collection) — In progress
- [x] Homepage Gamo Live pill (Promote Events / Explore Events) — In progress

**Live (`apps/live`)**
- [ ] `/promote` (organizer promotion landing)
- [ ] `/organizer/events/new` (event submission)
- [ ] `/organizer/events/[id]/promote` (package selection: audience, location, duration, budget)
- [ ] `/organizer/campaigns/[id]` (campaign status & performance report)
- [ ] `/events` filters (location, date, organizer, type, free/paid)
- [ ] `/organizers/[slug]` (church/artist/choir profile & events)
- [ ] `/events/[id]/register` (free registration)
- [ ] `/my-tickets` (attendee tickets & confirmations)

**Admin (`apps/admin`)**
- [ ] `/events` (moderation & approval queue)
- [ ] `/campaigns` and `/campaigns/[id]` (intake, status, budget tracking)
- [ ] `/placements` (featured-placement scheduler, sponsored vs editorial)
- [ ] `/ticketing` (ticketing oversight)
- [ ] `/organizers` and `/memberships` (organizer & Partners management)

**Production (`apps/production`)**
- [ ] Event marketing / promotional creative service page

## Shared Architecture
- [x] Tailwind config / UI tokens in all Astro apps
- [x] Shared layout structure (`Inter`, layout, global styles)

**Status:** All essential mock UI screens for Milestone 0 and visual prototypes for Milestones 1-4 are completed. Next step: Functionality Phase Plan.
