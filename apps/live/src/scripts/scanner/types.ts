/** Client-side shapes of the scanner API (mirror openapi/components/schemas/live/scanner/*). */
export interface ScanOutcomeView {
  result: string;
  admitted: boolean;
  title: string;
  message: string;
  repeated: boolean;
  offline: boolean;
  conflict: string;
  ticket: {
    holder: string;
    category: string | null;
    section: string | null;
    zone: string | null;
    seatsPerTicket: number;
  } | null;
}

export interface ManifestTicket {
  i: string;
  v: number;
  d: string;
  c: string | null;
  s: string | null;
  z: string[];
  st: 'valid' | 'voided' | 'refunded';
  n: string;
  p: Record<string, { s: 'inside' | 'outside'; e: number }>;
}

export interface ScannerManifest {
  v: 1;
  eventId: string;
  eventTitle: string;
  timeZone: string;
  startsAt: number;
  endsAt: number;
  opensAt: number;
  eventDayKey: string;
  cancelled: boolean;
  maxEntriesPerDay: number | null;
  categories: Record<string, { name: string; validDays: string[] | null; seats: number }>;
  tickets: ManifestTicket[];
  legacy: Array<{ h: string; n: string; c: string | null; st: string }>;
  generatedAt: number;
}

export interface SyncedScanView {
  clientScanId: string;
  result: string;
  conflict: string;
  needsReview: boolean;
  title: string;
  message: string;
  holder: string | null;
}
