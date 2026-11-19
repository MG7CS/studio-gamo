# Page by page: what carries over

Owner direction (2026-11-19): work one page at a time. Finish a page, then note here what will transfer to the other
pages, so it is applied when we reach them. Order: home (main site), then Academy, then the rest.

## Status

| Page                          | Status      |
| ----------------------------- | ----------- |
| Home (gamostudio.org `/`)     | In progress |
| Academy (academy.gamostudio.org) | Next     |
| Everything else               | Later       |

## Changes made on one page that carry over to the others

1. **Headings in title case.** The first letter of every word is capitalised except the small words (a, an, the, and,
   but, or, nor, for, so, yet, as, at, by, in, of, on, to, up, from, with, into, onto, over, per, via, is). The first
   word is always capitalised. A page that is done carries `data-heading-case="as-written"` on its content so the
   shared heading styles (and photo-card titles, `.media-card__title`) show the text exactly as typed; pages not yet
   done still use the old rule (every word capitalised by CSS). When every page is done, make "as written" the default
   and remove the attribute. Done: home (5ff33a15).
2. **Headings are short:** one line where possible, two at most. One exception, by the owner (2026-11-19): the home hero heading is longer, "Preparing the Way so Worship Can Rise in Every Community", because it has to cover worship, learning and the technical and software work without naming music.
3. **Photos crop as little as possible and are at least as tall as the text beside them.** Use the frame ratio closest
   to the photo's own shape; make the photo taller, or trim the text when a wide photo cannot grow. Done: main site
   (082ac360), Academy (490fccc2). Ready but unchecked: Worship and Production, parked on the branch
   `wip/worship-production-photo-heights` (c8a9012a); check on screen and merge when we reach those pages.
4. **No Sample, Proposal, planned or testing tags** on public sections; no made-up names, dates or prices shown as
   real (done on all four sites, 2026-11-19). Fee-proposal sentences stay as plain body text; legal draft notices
   stay.
5. **Shared photo cards and the closing invitation band** still force landscape: add a frame-shape option to
   `MediaCard` and `CtaInvitation` when a page needs it (for example Academy's "Lessons for Every Age & Stage" cards
   and its closing band crop portrait photos).
6. **Header menu tiles are pictures without links** (ddb2b62d): the side links and "All of …" still work. Applies to
   every page already, because the header is shared.
7. **Turning the menu pictures into links, later.** In `packages/config/menus.ts` a picture tile has no `href`. When a
   page behind a tile has been reviewed (an instrument page, a service page), add its `href` to that tile: on desktop
   the tile becomes a link, and on phone and iPad the picture list on the program's second screen (the Tesla layout)
   appears automatically, listing only the tiles that have a link. Until then the phone shows the working text links only.
8. **Photo first when stacked.** On phone and iPad a section that pairs a photo with text starts with the photo, then
   the heading, text and buttons (home done, 4007e3e9). The shared `SplitHero`, `EditorialFeatureCard` and
   `CtaInvitation` take `mediaFirstStacked`; set it on each page as we reach it.
9. **Phone menu** is a full-screen list with a labelled "Menu" button and a drill-down second screen (2a5b1c11,
   804f2d5b); it is shared, so it already applies to every page.

## Decisions waiting for the owner (ask when we reach the page)

- **Header menu destinations:** the menu tiles are muted (pictures only). Decide per page whether the instrument and
  service pages they used to open stay reachable from their own sections or are hidden until reviewed.
- **Mission page:** the "Built for the Whole Worshiping Community" list was cut from five audiences to three to balance
  the photo (082ac360). Keep three, or restore all five?
- **Worship FAQ:** two answers were reworded on 2026-11-16; keep or restore the live wording.
- **Rules still mentioning Sample labels:** `AGENTS.md` (required labels), two legal pages ("labelled 'Sample'"),
  Academy registration emails ("(Sample lesson …)"), the shared preview card's default Sample badge.
- **Academy home sign-up section:** three small pill-shaped badges remain.
