/** Small builders shared by the staff operations & analytics screens. */
import type { BadgeValue, Cell, DashBlock } from '@studio-gamo/ui/lib/dashboard';
import type { IconName } from '@studio-gamo/ui/lib/icons';

export type Col = [key: string, label: string];

/** Filterable, exportable operational queue table. First column is the primary column. */
export function queue(
  title: string,
  cols: Col[],
  rows: Record<string, Cell>[],
  filterKey?: string,
  filterOptions?: string[],
  rowAction?: { label: string; dialog: string; icon?: IconName }
): DashBlock {
  return {
    type: 'table',
    span: 3,
    title,
    filter: Boolean(filterKey) || rows.length >= 3,
    filterKey,
    filterOptions,
    exportable: true,
    rowAction,
    columns: cols.map(([key, label], i) => ({ key, label, primary: i === 0 })),
    rows,
  };
}

/** Standard staff review & decision dialog with pre-populated record subject and audit reason. */
export function decisionDialog(
  id: string,
  title: string,
  subject: string,
  options: string[] = ['Approve', 'Request more information', 'Hold for coordinator review', 'Decline']
): DashBlock {
  return {
    type: 'dialog',
    id,
    title,
    body: `Record an administrative decision for ${subject}. Every decision requires an audit reason.`,
    fields: [
      { name: 'subject', label: 'Target record', type: 'text', value: subject, required: true },
      { name: 'decision', label: 'Administrative action', type: 'select', options, required: true },
      { name: 'reason', label: 'Audit log reason & operational notes', type: 'textarea', required: true, placeholder: 'State the verification check or policy basis for this decision...' },
    ],
    confirmLabel: 'Record decision',
    successText: 'Administrative decision recorded in the audit log.',
  };
}

export const privacy = (body: string): DashBlock => ({ type: 'notice', tone: 'privacy', body });
export const fairness: DashBlock = {
  type: 'notice',
  tone: 'info',
  body: 'Payment, sponsorship or partnership never affects musician vetting, placement order, artist verification, or discovery rankings.',
};
export type { BadgeValue };
