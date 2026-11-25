// Reads barcodes with the phone camera, using the browser's built-in BarcodeDetector (Chrome on Android).
// Where the browser cannot do this, the button is hidden and a USB/Bluetooth scanner or typing still works.

export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];

export function cameraScanSupported(): boolean {
  try {
    return typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  } catch {
    return false;
  }
}

function friendlyError(e: unknown): string {
  const name = String((e as { name?: unknown })?.name ?? '');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The camera was not allowed. Allow the camera for this site in the browser settings and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this phone.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'The camera could not be started. You can type the barcode number instead.';
}

export interface CameraScan {
  stop: () => void;
}

/**
 * Starts the camera in `video` and calls onCode for each barcode it reads.
 * A barcode that stays in front of the camera is counted once. To count it again it must leave the view
 * for more than `gapMs` (so two bottles of the same brand are counted when shown one after the other).
 */
export async function startCameraScan(
  video: HTMLVideoElement,
  handlers: { onCode: (code: string) => void; onError: (message: string) => void },
  opts: { gapMs?: number; intervalMs?: number } = {},
): Promise<CameraScan> {
  const gapMs = opts.gapMs ?? 1000;
  const intervalMs = opts.intervalMs ?? 300;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // already stopped
    }
    stream = null;
    try {
      video.srcObject = null;
    } catch {
      // ignore
    }
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (stopped) {
      stop();
      return { stop };
    }
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    try {
      await video.play();
    } catch {
      // some browsers start it by themselves
    }

    const Detector = (window as any).BarcodeDetector;
    let detector: any;
    try {
      detector = new Detector({ formats: BARCODE_FORMATS });
    } catch {
      detector = new Detector();
    }

    const lastSeen = new Map<string, number>();
    let busy = false;
    timer = setInterval(async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const found: any[] = await detector.detect(video);
        const now = Date.now();
        if (lastSeen.size > 100) lastSeen.clear();
        for (const f of found) {
          const code = String(f?.rawValue ?? '');
          if (!code) continue;
          const before = lastSeen.get(code);
          lastSeen.set(code, now);
          if (before === undefined || now - before > gapMs) handlers.onCode(code);
        }
      } catch {
        // a frame that cannot be read is skipped
      } finally {
        busy = false;
      }
    }, intervalMs);
    return { stop };
  } catch (e) {
    stop();
    handlers.onError(friendlyError(e));
    return { stop };
  }
}
