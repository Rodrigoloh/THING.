'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function InviteQr({ url, label }: { url: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!url || !canvas.current) return;
    void QRCode.toCanvas(canvas.current, url, {
      width: 224,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#171717', light: '#FFFFFF' },
    });
  }, [url]);
  return <div className="flex justify-center rounded-[20px] bg-white p-4">
    <canvas ref={canvas} role="img" aria-label={label} data-invite-url={url} className="h-56 w-56 max-w-full" />
  </div>;
}
