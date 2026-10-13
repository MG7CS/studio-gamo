/** Small builders shared by the staff screens to keep each screen definition compact. */
import type { BadgeValue, Cell, DashBlock } from '@studio-gamo/ui/lib/dashboard';

export type Col = [key: string, label: string];

/** Filterable status queue table. First column is the primary column. */
export function queue(title: string, cols: Col[], rows: Record<string, Cell>[], filterKey?: string, filterOptions?: string[]): DashBlock {
  return {
    type: 'table', span: 3, title, filter: Boolean(filterKey), filterKey, filterOptions,
    columns: cols.map(([key, label], i) => ({ key, label, primary: i === 0 })),
    rows,
  };
}

/** Standard staff decision dialog: approve / request info / decline, with a required reason. */
export function decisionDialog(id: string, title: string, subject: string): DashBlock {
  return {
    type: 'dialog', id, title,
    body: `Record a decision for ${subject}. Decisions are not saved and nobody is notified in this preview.`,
    fields: [
      { name: 'decision', label: 'Decision', type: 'select', options: ['Approve', 'Request more information', 'Decline'], required: true },
      { name: 'reason', label: 'Reason (recorded in audit log)', type: 'textarea', required: true },
    ],
    confirmLabel: 'Record decision (demo)',
    successText: 'Decision captured in this preview only. No record changed and no one was contacted.',
  };
}

export const privacy = (body: string): DashBlock => ({ type: 'notice', tone: 'privacy', body });
export const fairness: DashBlock = { type: 'notice', tone: 'info', body: 'Payment, sponsorship or partnership never affects musician vetting, placement order or rankings.' };
export type { BadgeValue };
