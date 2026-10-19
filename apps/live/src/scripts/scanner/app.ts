/**
 * Door scanner client (progressive enhancement of /scan/<event>): camera scanning, online scans via
 * POST /api/scanner/scan, a 4-second repeat-scan debounce, the offline manifest + IndexedDB queue,
 * sync via POST /api/scanner/sync, the 10-second headcount poll and the service worker.
 * Every result is rendered into an aria-live="assertive" panel; sound and vibration are opt-in.
 */
import { startCamera, type CameraHandle } from './camera';
import { decideOffline } from './offline';
import { renderOutcome } from './render';
import { enqueue, loadManifest, queued, removeQueued, saveManifest } from './store';
import type { ScanOutcomeView, ScannerManifest, SyncedScanView } from './types';

const DEBOUNCE_MS = 4000;
const HEADCOUNT_MS = 10_000;
const SYNC_MS = 30_000;
const MANIFEST_MS = 5 * 60_000;

class NetworkDown extends Error {}

async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T | null; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new NetworkDown();
  }
  const text = await res.text();
  let body: T | null;
  try {
    body = text ? (JSON.parse(text) as T) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}

const post = <T>(path: string, data: unknown) =>
  api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

function newClientScanId(device: string): string {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${device}-${Date.now().toString(36)}-${rand[0].toString(36)}${rand[1].toString(36)}`.slice(0, 64);
}

function readPref(name: string): boolean {
  try {
    return localStorage.getItem(`gamo-scanner-${name}`) === '1';
  } catch {
    return false;
  }
}

export function startScanner(root: HTMLElement) {
  const eventId = root.dataset.eventId ?? '';
  const device = (root.dataset.device ?? 'dev').replace(/[^A-Za-z0-9_-]/g, '');
  const canOffline = root.dataset.offline === 'yes';
  let gateZones: string[] = [];
  try {
    gateZones = JSON.parse(root.dataset.zones ?? '[]') as string[];
  } catch {
    gateZones = [];
  }
  const panel = root.querySelector<HTMLElement>('[data-result-panel]')!;
  const form = root.querySelector<HTMLFormElement>('[data-manual-form]');
  const codeInput = root.querySelector<HTMLInputElement>('#ticket-code');
  const connection = root.querySelector<HTMLElement>('[data-connection]');
  const review = root.querySelector<HTMLElement>('[data-review]');
  const reviewTitle = root.querySelector<HTMLElement>('[data-review-title]');
  const reviewList = root.querySelector<HTMLElement>('[data-review-list]');
  const counts = {
    inside: root.querySelector<HTMLElement>('[data-count-inside]'),
    admitted: root.querySelector<HTMLElement>('[data-count-admitted]'),
    capacity: root.querySelector<HTMLElement>('[data-count-capacity]'),
  };
  let manifest: ScannerManifest | null = null;
  let manifestEtag: string | null = null;
  let last = { code: '', at: 0 };
  let busy = false;
  let syncing = false;

  const direction = (): 'in' | 'out' => {
    const checked =
      root.querySelector<HTMLInputElement>('input[data-direction]:checked') ??
      root.querySelector<HTMLInputElement>('input[data-direction][type="hidden"]');
    return checked?.value === 'out' ? 'out' : 'in';
  };

  const feedback = (outcome: ScanOutcomeView) => {
    if (readPref('vibrate') && 'vibrate' in navigator)
      navigator.vibrate(outcome.admitted || outcome.result === 'exited' ? 80 : [60, 60, 60]);
    if (readPref('sound')) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.frequency.value = outcome.admitted || outcome.result === 'exited' ? 880 : 220;
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        // Audio is optional.
      }
    }
  };

  const setConnection = async () => {
    if (!connection) return;
    const pending = canOffline ? (await queued(eventId).catch(() => [])).length : 0;
    const status = navigator.onLine
      ? 'Online'
      : canOffline
        ? 'Offline — scans are saved on this phone'
        : 'Offline — reconnect to scan';
    connection.textContent = pending
      ? `${status} · ${pending} ${pending === 1 ? 'scan' : 'scans'} waiting to sync`
      : status;
  };

  const showReview = (items: SyncedScanView[]) => {
    const flagged = items.filter((i) => i.needsReview);
    if (!review || !reviewTitle || !reviewList || flagged.length === 0) return;
    review.hidden = false;
    reviewTitle.textContent = `${flagged.length} ${flagged.length === 1 ? 'scan needs' : 'scans need'} review`;
    reviewList.replaceChildren(
      ...flagged.map((i) => {
        const li = document.createElement('li');
        li.textContent = `${i.holder ?? 'Ticket'}: ${i.title}${i.conflict === 'duplicate_offline' ? ' (also admitted on another scanner while offline)' : ''}`;
        return li;
      }),
    );
  };

  const refreshHeadcount = async () => {
    if (!navigator.onLine || document.hidden) return;
    try {
      const r = await api<{ data: { insideNow: number; admittedToday: number; capacity: number } }>(
        `/api/scanner/headcount?eventId=${encodeURIComponent(eventId)}`,
      );
      if (r.status === 200 && r.body) {
        if (counts.inside) counts.inside.textContent = String(r.body.data.insideNow);
        if (counts.admitted) counts.admitted.textContent = String(r.body.data.admittedToday);
        if (counts.capacity) counts.capacity.textContent = String(r.body.data.capacity);
      }
    } catch {
      // Offline: keep the last numbers.
    }
  };

  const refreshManifest = async () => {
    if (!canOffline) return;
    if (!manifest) {
      const stored = await loadManifest(eventId).catch(() => null);
      if (stored) ({ manifest, etag: manifestEtag } = stored);
    }
    if (!navigator.onLine) return;
    try {
      const r = await api<{ data: ScannerManifest }>(
        `/api/scanner/manifest?eventId=${encodeURIComponent(eventId)}`,
        {
          headers: manifestEtag ? { 'If-None-Match': manifestEtag } : {},
        },
      );
      if (r.status === 200 && r.body) {
        manifest = r.body.data;
        manifestEtag = r.headers.get('etag');
        await saveManifest(eventId, manifestEtag, manifest);
      }
    } catch {
      // Keep the stored manifest.
    }
  };

  const sync = async () => {
    if (!canOffline || syncing || !navigator.onLine) return;
    syncing = true;
    try {
      let pending = await queued(eventId);
      while (pending.length) {
        const chunk = pending.slice(0, 200);
        const r = await post<{ data: { results: SyncedScanView[] } }>('/api/scanner/sync', {
          eventId,
          scans: chunk.map((q) => ({
            clientScanId: q.clientScanId,
            code: q.code,
            direction: q.direction,
            deviceScannedAt: q.deviceScannedAt,
            localResult: q.localResult,
          })),
        });
        if (r.status !== 200 || !r.body) break;
        await removeQueued(chunk.map((q) => q.clientScanId));
        showReview(r.body.data.results);
        pending = await queued(eventId);
      }
      await refreshManifest();
    } catch {
      // Still offline; try again later.
    } finally {
      syncing = false;
      await setConnection();
      await refreshHeadcount();
    }
  };

  const scanOffline = async (code: string, dir: 'in' | 'out', clientScanId: string) => {
    if (!manifest) {
      renderOutcome(panel, {
        error:
          'No connection and no ticket list on this phone yet. Reconnect once to download it, or use the printed guest list.',
      });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const queue = await queued(eventId);
    const { outcome, ticketKey } = await decideOffline({
      manifest,
      queue,
      code,
      direction: dir,
      gateZones,
      now,
    });
    await enqueue({
      clientScanId,
      eventId,
      code,
      direction: dir,
      deviceScannedAt: now,
      localResult: outcome.result,
      ticketKey,
    });
    renderOutcome(panel, outcome);
    feedback(outcome);
    await setConnection();
  };

  const handleCode = async (raw: string) => {
    const code = raw.trim();
    if (!code || busy) return;
    const nowMs = Date.now();
    if (code === last.code && nowMs - last.at < DEBOUNCE_MS) return; // repeat scan of the same code
    last = { code, at: nowMs };
    busy = true;
    const dir = direction();
    const clientScanId = newClientScanId(device);
    try {
      if (!navigator.onLine && canOffline) return await scanOffline(code, dir, clientScanId);
      const r = await post<{ data?: ScanOutcomeView; error?: { message: string } }>('/api/scanner/scan', {
        eventId,
        code,
        direction: dir,
        clientScanId,
      });
      if (r.status === 200 && r.body?.data) {
        renderOutcome(panel, r.body.data);
        feedback(r.body.data);
        void refreshHeadcount();
      } else
        renderOutcome(panel, { error: r.body?.error?.message ?? 'The scan was not recorded. Try again.' });
    } catch (err) {
      if (err instanceof NetworkDown && canOffline) await scanOffline(code, dir, clientScanId);
      else
        renderOutcome(panel, {
          error: 'No connection. Reconnect and scan again, or use the printed guest list.',
        });
    } finally {
      busy = false;
    }
  };

  form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const value = codeInput?.value ?? '';
    last = { code: '', at: 0 }; // a typed code is always checked
    void handleCode(value).then(() => {
      if (codeInput) {
        codeInput.value = '';
        codeInput.focus();
      }
    });
  });

  // Camera
  const camera = root.querySelector<HTMLElement>('[data-camera]');
  const video = root.querySelector<HTMLVideoElement>('[data-camera-video]');
  const startBtn = root.querySelector<HTMLButtonElement>('[data-camera-start]');
  const stopBtn = root.querySelector<HTMLButtonElement>('[data-camera-stop]');
  const cameraStatus = root.querySelector<HTMLElement>('[data-camera-status]');
  let handle: CameraHandle | null = null;
  if (camera && video && startBtn && stopBtn && typeof navigator.mediaDevices?.getUserMedia === 'function') {
    camera.hidden = false;
    startBtn.addEventListener('click', async () => {
      try {
        if (cameraStatus) cameraStatus.textContent = 'Starting the camera…';
        handle = await startCamera(video, (code) => void handleCode(code));
        startBtn.hidden = true;
        stopBtn.hidden = false;
        if (cameraStatus) cameraStatus.textContent = 'Camera on. Hold the ticket inside the frame.';
      } catch {
        if (cameraStatus)
          cameraStatus.textContent =
            'The camera could not start. Allow camera access for this site, or type the code below.';
      }
    });
    stopBtn.addEventListener('click', () => {
      handle?.stop();
      handle = null;
      startBtn.hidden = false;
      stopBtn.hidden = true;
      if (cameraStatus) cameraStatus.textContent = 'Camera off.';
    });
  }

  // Preferences (off by default)
  const prefs = root.querySelector<HTMLElement>('[data-feedback-options]');
  if (prefs) {
    prefs.hidden = false;
    prefs.querySelectorAll<HTMLInputElement>('input[data-pref]').forEach((input) => {
      input.checked = readPref(input.dataset.pref ?? '');
      input.addEventListener('change', () => {
        try {
          localStorage.setItem(`gamo-scanner-${input.dataset.pref}`, input.checked ? '1' : '0');
        } catch {
          // Preferences are optional.
        }
      });
    });
  }

  window.addEventListener('online', () => void sync());
  window.addEventListener('offline', () => void setConnection());
  setInterval(() => void refreshHeadcount(), HEADCOUNT_MS);
  setInterval(() => void sync(), SYNC_MS);
  setInterval(() => void refreshManifest(), MANIFEST_MS);
  void refreshManifest().then(() => sync());
  void setConnection();

  if (canOffline && 'serviceWorker' in navigator)
    navigator.serviceWorker.register('/scan/sw.js', { scope: '/scan/' }).catch(() => undefined);
  root.dataset.ready = 'true';
}
