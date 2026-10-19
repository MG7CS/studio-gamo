/**
 * Camera QR reading: the browser's BarcodeDetector where it supports QR codes (Chrome/Android,
 * Edge), else jsQR (Apache-2.0, pure JS, loaded on demand as its own same-origin chunk — iOS Safari).
 */
type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorCtor = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

export interface CameraHandle {
  stop(): void;
}

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code'];
    return formats.includes('qr_code') ? new Ctor({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

export async function startCamera(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  let stopped = false;
  const detector = await nativeDetector();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const jsQR = detector ? null : (await import('jsqr')).default;

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) onCode(codes[0].rawValue);
        } else if (jsQR && ctx) {
          const w = Math.min(video.videoWidth, 960);
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 0;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            if (found?.data) onCode(found.data);
          }
        }
      }
    } catch {
      // A failed frame is skipped; the next one is tried.
    }
    setTimeout(() => void tick(), 200);
  };
  void tick();
  return {
    stop() {
      stopped = true;
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
