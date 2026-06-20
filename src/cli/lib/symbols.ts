import { isUnicodeSupported } from './tty';

const u = isUnicodeSupported;

export const SYM = {
  check:    u ? '✔' : 'v',      // ✓
  cross:    u ? '✘' : 'x',      // ✗
  circle:   u ? '○' : 'o',      // ○
  repeat:   u ? '↻' : 'R',      // ↻
  undo:     u ? '↩' : '<-',     // ↩
  fire:     u ? '🔥' : '*', // 🔥
  ellipsis: u ? '…' : '...',    // …
  dash:     u ? '─' : '-',      // ─
} as const;
