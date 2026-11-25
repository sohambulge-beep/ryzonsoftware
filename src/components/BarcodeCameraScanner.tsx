import { useEffect, useRef, useState } from 'react';
import { startCameraScan, type CameraScan } from '@/lib/barcodeCamera';

interface Props {
  onCode: (code: string) => void;
  onClose: () => void;
}

/** Shows the phone camera and reads barcodes from it. Closing it switches the camera off. */
export function BarcodeCameraScanner({ onCode, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeRef = useRef(onCode);
  const [error, setError] = useState('');

  // The newest handler is always used, without restarting the camera.
  useEffect(() => {
    codeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let scan: CameraScan | null = null;
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;
    startCameraScan(video, {
      onCode: (code) => codeRef.current(code),
      onError: (message) => {
        if (!cancelled) setError(message);
      },
    }).then((s) => {
      if (cancelled) s.stop();
      else scan = s;
    });
    return () => {
      cancelled = true;
      scan?.stop();
    };
  }, []);

  return (
    <div className="space-y-2 rounded-md border p-2">
      <video ref={videoRef} muted playsInline className="w-full rounded-md bg-black" style={{ maxHeight: 280 }} />
      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Hold the bottle's barcode in front of the camera. Each bottle is counted once. Show the next bottle after
          moving the first one away.
        </p>
      )}
      <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
        Close camera
      </button>
    </div>
  );
}
