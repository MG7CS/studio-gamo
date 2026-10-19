/**
 * Camera scanning for the check-in screen, using the browser's built-in barcode detector (no third-party code).
 * Where it is not available the typed-code form still works. Each scan is sent to the same page as JSON.
 */
interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
declare const BarcodeDetector: { new (options: { formats: string[] }): Detector } | undefined;

const root = document.querySelector<HTMLElement>('[data-checkin]');
if (root && typeof BarcodeDetector !== 'undefined' && 'mediaDevices' in navigator) {
  setup(root);
}

function setup(el: HTMLElement) {
  const button = el.querySelector<HTMLButtonElement>('#scan-start')!;
  const video = el.querySelector<HTMLVideoElement>('#scan-video')!;
  const result = el.querySelector<HTMLElement>('#scan-result')!;
  const detector = new BarcodeDetector!({ formats: ['qr_code'] });
  let stream: MediaStream | null = null;
  let last = '';
  let lastAt = 0;
  button.hidden = false;

  const show = (text: string, tone: 'ok' | 'bad') => {
    result.textContent = text;
    result.className =
      'mt-4 rounded-xl border px-4 py-3 text-[15px] font-semibold ' +
      (tone === 'ok'
        ? 'border-sand bg-cream text-ink'
        : 'border-terracotta-deep/40 bg-white text-terracotta-deep');
  };

  async function send(code: string) {
    const response = await fetch(window.location.pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string; ok?: boolean } | null;
    show(body?.message ?? 'That could not be checked.', body?.ok ? 'ok' : 'bad');
  }

  async function tick() {
    if (!stream) return;
    try {
      const found = await detector.detect(video);
      const value = found[0]?.rawValue;
      if (value && (value !== last || Date.now() - lastAt > 4000)) {
        last = value;
        lastAt = Date.now();
        await send(value);
      }
    } catch {
      // A frame that cannot be read is skipped.
    }
    setTimeout(tick, 300);
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.hidden = true;
    button.textContent = 'Scan with camera';
  }

  button.addEventListener('click', async () => {
    if (stream) return stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      button.textContent = 'Stop camera';
      void tick();
    } catch {
      show('The camera could not be opened. You can type the code instead.', 'bad');
    }
  });
  document.addEventListener('visibilitychange', () => document.hidden && stop());
}
