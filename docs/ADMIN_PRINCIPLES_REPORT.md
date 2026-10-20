# Admin: what the Live principles changed

Date: 2026-10-19. The admin keeps its claymorphism shapes and shadows, no gradients, its Cloudflare Access gate and its navigation. Only structure and behaviour changed. Nothing was committed or deployed.

## Transferred

| Principle | In the admin now |
| --- | --- |
| Floating cards (toolbar card, one card per row) | The filters and search of Organizations, Participation requests and the church/provider queues are one toolbar card each (shared `Toolbar`). "Waiting longest" on the Inbox is one card per item (it was one panel with dividers). The cleanup page uses the shared `Panel`. |
| Reuse first (one shared component per pattern) | The admin's own `Notice`, `EmptyState` and `PageHeader` were deleted; it uses the shared ones. `StatusTag` now renders the shared `Pill`. `LiveTabs` uses the shared `FilterChips`. `Panel` moved from the Live organizer folder to `packages/ui` (with a `clay` variant) and `Toolbar` was added there; Live's events list uses the same `Toolbar`. Four hand-written chip rows were removed. |
| One shell | The person menu moved to the bottom of the sidebar (and one avatar button in the phone top bar): who is signed in and Sign out. The top bar is phone-only. The "Collapse menu" button is in the sidebar. The collapsed rail logo is an inline orange SVG. |
| Menus behave like menus | The new menu closes on an outside press and Escape (shared `interactions` script, already loaded by the admin layout). Browser-tested. |
| Dangerous actions confirm first | "Run cleanup…" and "Hide event…" use the shared `ConfirmAction`: the first press shows the consequence (and the required note for Hide), the second does the action. The old tick-box is gone. The server still requires the confirmation field. |
| Accessible names come from visible text | The sidebar count badge reads "3 waiting" through hidden text instead of an `aria-label`. The phone tab bar names are the visible word plus bracketed hidden words, for example "Requests (Participation requests, 2 waiting)", with no `aria-label`. Stat cards say "Opens the list". |
| Every number links to what it counts | Already true on the Inbox (each card opens its queue). Left as it was and now covered by a browser test. |
| Thin pages | Already true in the admin (logic sits in `src/lib`). No page logic was added. |
| Status colours from one source | Pills use the shared status tokens. |

## Not changed, on purpose

- Button, stat card and list rows keep the admin's clay look. The shared `Button` and `StatCard` are warm-flat; making them themeable is a later step if you want one component for both.
- Page titles are now the shared 26 px semibold title. That is a visible change in the admin; tell me if you want the larger one back.
- The Gamo Live tabs and the filters are now white/terracotta chips instead of raised clay pills.
- Nothing about the calendar: the admin has no date-heavy screen yet.
- No new admin screens, no new data.

## Also done in this session

- `make admin-phone` (secret link, clipboard). While it runs, the admin needs the secret on this computer too. `make dev-admin` is unchanged and this-computer only.
- Two Live fixes found by the browser tests: unselectable months in the calendar picker used faded text (axe contrast), now solid muted text; a brittle selector in the Live flow spec.

## Checked

Typecheck (all apps and packages), eslint with zero warnings, prettier, builds of admin and Live, admin browser spec 9/9 (axe on every page, 360 px, 44 px targets, new menu/confirm/count-link test), both Live browser flows, the audit and config unit tests (35/35). The marketing-page diff against `98719de` is empty.

Not run: the full unit suite, the full Playwright run, the Live public smoke. Not looked at by eye: I have no admin screenshots to show; open the admin to review.
