import { isUnicodeSupported } from './tty';

const u = isUnicodeSupported;

export const SYM = {
  check:    u ? '\u2714' : 'v',      // ✓
  cross:    u ? '\u2718' : 'x',      // ✗
  circle:   u ? '\u25cb' : 'o',      // ○
  repeat:   u ? '\u21bb' : 'R',      // ↻
  undo:     u ? '\u21a9' : '<-',     // ↩
  fire:     u ? '\ud83d\udd25' : '*', // 🔥
  ellipsis: u ? '\u2026' : '...',    // …
  dash:     u ? '\u2500' : '-',      // ─
  bullet:   u ? '\u2022' : '*',      // •
  arrow:    u ? '\u2192' : '->',     // →
} as const;
