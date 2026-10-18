/**
 * IndexedDB for the scanner: the event manifest (with its ETag) and the offline scan queue.
 * Nothing here holds emails or full names (the manifest carries initials only).
 */
import type { ScannerManifest } from './types';

const DB_NAME = 'gamo-scanner';
const VERSION = 1;

export interface QueuedScan {
  clientScanId: string;
  eventId: string;
  code: string;
  direction: 'in' | 'out';
  deviceScannedAt: number;
  localResult: string | null;
  /** Manifest ticket key (QR id part or legacy hash) used to replay local presence. */
  ticketKey: string | null;
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('manifest')) db.createObjectStore('manifest', { keyPath: 'eventId' });
      if (!db.objectStoreNames.contains('queue')) {
        const q = db.createObjectStore('queue', { keyPath: 'clientScanId' });
        q.createIndex('eventId', 'eventId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveManifest(eventId: string, etag: string | null, manifest: ScannerManifest) {
  const db = await open();
  await done(
    db
      .transaction('manifest', 'readwrite')
      .objectStore('manifest')
      .put({ eventId, etag, manifest, savedAt: Date.now() }),
  );
}

export async function loadManifest(
  eventId: string,
): Promise<{ etag: string | null; manifest: ScannerManifest } | null> {
  const db = await open();
  return (
    ((await done(db.transaction('manifest').objectStore('manifest').get(eventId))) as
      { etag: string | null; manifest: ScannerManifest } | undefined) ?? null
  );
}

export async function enqueue(scan: QueuedScan) {
  const db = await open();
  await done(db.transaction('queue', 'readwrite').objectStore('queue').put(scan));
}

export async function queued(eventId: string): Promise<QueuedScan[]> {
  const db = await open();
  const all = (await done(
    db.transaction('queue').objectStore('queue').index('eventId').getAll(eventId),
  )) as QueuedScan[];
  return all.sort((a, b) => a.deviceScannedAt - b.deviceScannedAt);
}

export async function removeQueued(ids: string[]) {
  if (!ids.length) return;
  const db = await open();
  const tx = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  for (const id of ids) store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
