import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * A QR code drawn as an SVG, so it stays sharp at any size — on a laptop or
 * stretched across a TV at the front of church. Black on white with the
 * standard four-module quiet zone: the plainest form is the one every phone
 * camera reads first time, from a few metres away.
 */
export default function QrCode({ value, label, className = '' }) {
  const { path, size } = useMemo(() => {
    // Type 0 picks the smallest code that fits; a short link stays a coarse,
    // easy-to-read grid. Level M survives a smudge or a glare spot.
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 4;
    let d = '';
    // One rectangle per run of dark modules in a row, not one per module.
    for (let row = 0; row < count; row += 1) {
      let col = 0;
      while (col < count) {
        if (!qr.isDark(row, col)) { col += 1; continue; }
        let end = col;
        while (end < count && qr.isDark(row, end)) end += 1;
        d += `M${col + quiet} ${row + quiet}h${end - col}v1h${col - end}z`;
        col = end;
      }
    }
    return { path: d, size: count + quiet * 2 };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={label} shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg">
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
