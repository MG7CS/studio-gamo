/** Notes and status history of one submission as display rows (from its events, oldest first). */
import type { SubmissionEvent } from '@gamo/domain/forms';
import { formatUtc } from './format.ts';
import { STATUS_LABEL, isSubmissionStatus } from './statuses.ts';

export interface NoteRow {
  id: string;
  body: string;
  who: string;
  when: string;
}
export interface HistoryRow {
  id: string;
  text: string;
  note: string | null;
  who: string;
  when: string;
}

const label = (status: string): string => (isSubmissionStatus(status) ? STATUS_LABEL[status] : 'Unknown');

export function buildTimeline(
  events: SubmissionEvent[],
  names: Map<string, string>,
): { notes: NoteRow[]; history: HistoryRow[] } {
  const who = (e: SubmissionEvent) => (e.actorUserId ? (names.get(e.actorUserId) ?? 'Staff') : 'System');
  const notes: NoteRow[] = [];
  const history: HistoryRow[] = [];
  for (const e of events) {
    if (e.kind === 'note') {
      if (e.body) notes.push({ id: e.id, body: e.body, who: who(e), when: formatUtc(e.createdAt) });
    } else if (e.kind === 'status') {
      history.push({
        id: e.id,
        text: e.change
          ? `${label(e.change.from)} to ${label(e.change.to)}`
          : (e.body ?? 'Status changed').slice(0, 200),
        note: e.change?.note ?? null,
        who: who(e),
        when: formatUtc(e.createdAt),
      });
    } else if (e.kind === 'export') {
      history.push({
        id: e.id,
        text: 'Included in a CSV export',
        note: null,
        who: who(e),
        when: formatUtc(e.createdAt),
      });
    }
  }
  return { notes, history };
}
