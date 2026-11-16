# One public app (decision 2026-11-16)

## Decision
All public pages move into one app on `gamostudio.org`: Academy at `/academy/...`, Worship at `/worship/...`, Production at `/production/...`, plus the existing main-site pages. `apps/academy`, `apps/worship` and `apps/production` and their workers are deleted. `admin.gamostudio.org` stays a separate app (Cloudflare Access, no indexing, different security posture). Old subdomains redirect permanently to the new paths.

## Why
Separate apps existed for per-program accounts and dashboards, which are gone. The public apps already share D1, KV, R2 and the UI package; they cost 100 cross-app links, four workers, four configs and four test servers, and Phase 2 forms would be wired three times. Route collisions are only `/apply` and `/request` (Worship and Production), solved by prefixes.

## Research summary (2026-11-16)
- Google treats subdomains and subfolders the same in principle; Mueller: keep things together where possible. Evidence for a ranking lift is mixed, so the benefit is operational and consolidated internal linking, not a promised SEO gain. https://www.searchenginejournal.com/google-treats-subdomains-subdirectories-john-mueller-says/254687/
- Workers: size limit is 64 MiB uncompressed, startup 1 s; four Astro apps merged are far below; watch `startup_time_ms`. https://developers.cloudflare.com/workers/platform/limits/
- Redirects: Cloudflare Single Redirects (wildcard works on Free, 10 rules), hostnames must be proxied; `http*://academy.gamostudio.org/*` to `https://gamostudio.org/academy/${2}`; 301 for GET, 308 for non-GET; test with 302 first. https://developers.cloudflare.com/rules/url-forwarding/
- Deleting a Worker custom domain may remove its DNS record; add a proxied placeholder A/AAAA record before deleting the worker or the redirect never fires.
- Search Console Change of Address does not apply to subdomain-to-path moves; use 301s, a Domain property and a new sitemap. https://support.google.com/webmasters/answer/9370220
- Astro sitemap integration does not enumerate on-demand routes; build `sitemap.xml` from section manifests.

## Design
- Sections: `apps/web/src/features/{academy,worship,production}/` (components, data, lib) with thin routes in `src/pages/{academy,worship,production}/`. A section manifest per feature (id, label, basePath, nav, `data-section` theme value, sitemap entries, JSON-LD fragment, legacy redirects) and one registry that generates the header nav, footer groups, sitemap, robots and redirect tables. Removing a section = delete its folders and one registry line.
- One `Organization` JSON-LD node (`@id` `https://gamostudio.org/#organization`); sections reference it.
- Boundary lint: features cannot import from other features; shared cannot import from features; `packages/*` still never import from apps.
- Per-section theming only through semantic-token overrides on `[data-section]`.
- Links between sections use a `sectionPath()` helper, not hard-coded paths. `siteUrl('academy' | 'worship' | 'production')` calls (about 100) are replaced; `packages/config/apps.ts` keeps `web` and `admin`.
- Forms (Phase 2) are built once in the single app: `/worship/apply`, `/worship/request`, `/production/apply`, `/production/request`.

## Migration checklist (owner actions marked OWNER)
1. Confirm a Search Console Domain property exists (OWNER).
2. Build the old-URL to new-URL redirect map as a test (`scripts/audit/legacy-redirects.test.ts`); no chains longer than one hop.
3. Update Turnstile allowed hostnames, expected-hostname check, CSP `form-action`/`connect-src`, signed-link verification (accept old and new host during one link TTL), canonical URLs, JSON-LD, sitemap index, robots.
4. Merge apps, run the targeted tests, then one full `pnpm check`.
5. Deploy to preview; crawl old and new URL lists.
6. Production deploy of the merged worker (OWNER runs deploy).
7. Create Single Redirect rules with 302, verify with curl, switch to 301 and 308 for non-GET (OWNER, Cloudflare dashboard).
8. Remove old custom domains, add proxied placeholder DNS records, verify, then delete the old workers (OWNER).
9. Submit the new sitemap; monitor Search Console and logs for 4 to 8 weeks; keep redirects at least a year.
