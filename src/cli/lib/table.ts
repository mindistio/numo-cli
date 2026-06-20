import pc from 'picocolors';
import { isUnicodeSupported } from './tty';

const BOX = isUnicodeSupported
  ? {
      topLeft: String.fromCodePoint(0x250c),     // ┌
      topRight: String.fromCodePoint(0x2510),    // ┐
      bottomLeft: String.fromCodePoint(0x2514),  // └
      bottomRight: String.fromCodePoint(0x2518), // ┘
      horizontal: String.fromCodePoint(0x2500),  // ─
      vertical: String.fromCodePoint(0x2502),    // │
      midLeft: String.fromCodePoint(0x251c),     // ├
      midRight: String.fromCodePoint(0x2524),    // ┤
      midTop: String.fromCodePoint(0x252c),      // ┬
      midBottom: String.fromCodePoint(0x2534),   // ┴
      cross: String.fromCodePoint(0x253c),       // ┼
    }
  : {
      topLeft: '+',
      topRight: '+',
      bottomLeft: '+',
      bottomRight: '+',
      horizontal: '-',
      vertical: '|',
      midLeft: '+',
      midRight: '+',
      midTop: '+',
      midBottom: '+',
      cross: '+',
    };

export function renderTable(
  headers: string[],
  rows: string[][],
  emptyMessage = '(no results)',
): string {
  if (rows.length === 0) return pc.dim(emptyMessage);

  // Compute column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));

  const topBorder =
    BOX.topLeft +
    widths.map((w) => BOX.horizontal.repeat(w + 2)).join(BOX.midTop) +
    BOX.topRight;

  const midBorder =
    BOX.midLeft +
    widths.map((w) => BOX.horizontal.repeat(w + 2)).join(BOX.cross) +
    BOX.midRight;

  const bottomBorder =
    BOX.bottomLeft +
    widths.map((w) => BOX.horizontal.repeat(w + 2)).join(BOX.midBottom) +
    BOX.bottomRight;

  const formatRow = (cells: string[], bold = false) =>
    BOX.vertical +
    cells
      .map((c, i) => {
        const padded = pad(c, widths[i]);
        return ` ${bold ? pc.bold(padded) : padded} `;
      })
      .join(BOX.vertical) +
    BOX.vertical;

  const lines = [
    topBorder,
    formatRow(headers, true),
    midBorder,
    ...rows.map((r) => formatRow(r)),
    bottomBorder,
  ];

  return lines.join('\n');
}
