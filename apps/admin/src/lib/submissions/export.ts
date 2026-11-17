/** The response for a finished CSV export (the CSV itself is built and escaped by `FormsService.exportCsv`). */
import { contentDisposition } from './files.ts';

export function csvResponse(result: {
  csv: string;
  filename: string;
  rows: number;
  truncated: boolean;
}): Response {
  const headers = new Headers();
  headers.set('Content-Type', 'text/csv; charset=utf-8');
  // `contentDisposition` re-sanitises the name; the form slug it comes from is already [a-z0-9-].
  headers.set('Content-Disposition', contentDisposition('attachment', result.filename));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Export-Rows', String(result.rows));
  if (result.truncated) headers.set('X-Export-Truncated', 'true');
  return new Response(result.csv, { status: 200, headers });
}
