import test from 'node:test';
import assert from 'node:assert/strict';
import { adminWorkspace } from '../../apps/admin/src/data/workspace';
import { findScreen, type Workspace } from '../../packages/ui/src/lib/dashboard';

/** Admin is the only dashboard: the public role workspaces were removed with public accounts (2026-11-16). */
const ALL_WORKSPACES: Workspace[] = [adminWorkspace];

test('Admin workspace exposes full operational control, analytics hub and program screens with valid nav and dialog bindings', () => {
  const requiredSlugs = [
    '',
    'controls',
    'analytics',
    'analytics/programs',
    'analytics/financials',
    'analytics/trust',
    'analytics/exports',
    'users',
    'organizations',
    'roles',
    'reviews',
    'audit',
    'notifications',
    'worship/applications',
    'worship/review',
    'worship/requests',
    'worship/placement',
    'worship/standby',
    'worship/dispatch',
    'academy/instructors',
    'academy/enrollments',
    'academy/classes',
    'academy/hosted',
    'academy/sponsorships',
    'academy/safeguarding',
    'production/requests',
    'production/projects',
    'production/training',
    'production/personnel',
    'nonprofit/partnerships',
    'nonprofit/sponsorships',
    'nonprofit/funding',
    'nonprofit/budgets',
    'nonprofit/stewardship',
    'nonprofit/reconciliation',
    'nonprofit/governance',
  ];

  for (const slug of requiredSlugs) {
    const screen = findScreen(adminWorkspace, slug);
    assert.ok(screen, `Missing required admin screen: "${slug}"`);
  }
  // Gamo Live was retired (2026-11-16): no Live demo screens remain.
  assert.deepEqual(
    adminWorkspace.screens.filter((s) => s.slug.startsWith('live/')).map((s) => s.slug),
    [],
  );

  // Every sidebar nav item must resolve to an existing screen (or dedicated pages /legal, /security)
  for (const group of adminWorkspace.nav) {
    for (const item of group.items) {
      if (item.slug === 'legal' || item.slug === 'security') continue;
      // Provider review and participation pages were removed with public accounts.
      assert.ok(
        !item.slug.startsWith('review/') && !item.slug.startsWith('participation'),
        `Admin nav still links the removed page ${item.slug}`,
      );
      const resolved = findScreen(adminWorkspace, item.slug);
      assert.ok(resolved, `Admin nav item "${item.label}" (${item.slug}) does not resolve to a screen`);
    }
  }
});

test('All workspaces maintain valid dialog bindings for header actions and table rowActions', () => {
  for (const ws of ALL_WORKSPACES) {
    for (const screen of ws.screens) {
      const dialogIds = new Set(
        screen.blocks
          .filter((b): b is Extract<typeof b, { type: 'dialog' }> => b.type === 'dialog')
          .map((d) => d.id),
      );

      for (const action of screen.actions ?? []) {
        if (action.dialog) {
          assert.ok(
            dialogIds.has(action.dialog),
            `Workspace "${ws.id}" screen "${screen.slug}" action "${action.label}" references missing dialog "${action.dialog}"`,
          );
        }
      }

      for (const block of screen.blocks) {
        if (block.type === 'table' && block.rowAction) {
          assert.ok(
            dialogIds.has(block.rowAction.dialog),
            `Workspace "${ws.id}" screen "${screen.slug}" table "${block.title}" rowAction references missing dialog "${block.rowAction.dialog}"`,
          );
        }
      }
    }
  }
});

test('Analytics charts on the Admin dashboard have non-empty series and points', () => {
  let totalCharts = 0;
  let adminCharts = 0;

  for (const ws of ALL_WORKSPACES) {
    for (const screen of ws.screens) {
      for (const block of screen.blocks) {
        if (block.type === 'chart') {
          totalCharts++;
          if (ws.id === 'admin') adminCharts++;
          assert.ok(block.title, `Chart in ${ws.id}/${screen.slug} must have a title`);
          assert.ok(
            block.series.length > 0,
            `Chart "${block.title}" in ${ws.id}/${screen.slug} must have at least 1 series`,
          );
          for (const s of block.series) {
            assert.ok(s.label, `Series in chart "${block.title}" must have a label`);
            assert.ok(
              s.points.length > 0,
              `Series "${s.label}" in chart "${block.title}" must have at least 1 point`,
            );
          }
        }
      }
    }
  }

  assert.ok(adminCharts >= 10, `Expected at least 10 charts in Admin workspace, found ${adminCharts}`);
  assert.equal(totalCharts, adminCharts);
});

test('Workspaces never claim confirmed 501(c)(3) status or tax-deductible contributions', () => {
  const serialized = JSON.stringify(ALL_WORKSPACES);
  assert.ok(!/is a 501\(c\)\(3\)/i.test(serialized), 'Must never claim confirmed 501(c)(3) status');
  assert.ok(
    !/contributions are tax-deductible/i.test(serialized),
    'Must never claim contributions are tax-deductible',
  );
});
