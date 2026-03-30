import pc from 'picocolors';
import { isUnicodeSupported } from './tty';
import { SYM } from './symbols';

const FRAMES = isUnicodeSupported
  ? [
      String.fromCodePoint(0x280b),
      String.fromCodePoint(0x2819),
      String.fromCodePoint(0x2839),
      String.fromCodePoint(0x2838),
      String.fromCodePoint(0x283c),
      String.fromCodePoint(0x2834),
      String.fromCodePoint(0x2826),
      String.fromCodePoint(0x2827),
      String.fromCodePoint(0x2807),
      String.fromCodePoint(0x280f),
    ]
  : ['-', '\\', '|', '/'];

const INTERVAL = 80;
const MAX_RETRIES = 3;

interface SpinnerInstance {
  start(msg: string): void;
  update(msg: string): void;
  stop(msg?: string): void;
  fail(msg: string): void;
}

function createSpinner(interactive: boolean): SpinnerInstance {
  if (!interactive) {
    return { start() {}, update() {}, stop() {}, fail() {} };
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let frameIdx = 0;
  let currentMsg = '';

  function clear() {
    process.stderr.write('\r\x1b[K');
  }

  return {
    start(msg: string) {
      currentMsg = msg;
      frameIdx = 0;
      clear();
      process.stderr.write(`${pc.cyan(FRAMES[0])} ${msg}`);
      timer = setInterval(() => {
        frameIdx = (frameIdx + 1) % FRAMES.length;
        clear();
        process.stderr.write(`${pc.cyan(FRAMES[frameIdx])} ${currentMsg}`);
      }, INTERVAL);
    },
    update(msg: string) {
      currentMsg = msg;
    },
    stop(msg?: string) {
      if (timer) { clearInterval(timer); timer = null; }
      clear();
      process.stderr.write(`${pc.green(SYM.check)} ${msg ?? currentMsg}\n`);
    },
    fail(msg: string) {
      if (timer) { clearInterval(timer); timer = null; }
      clear();
      process.stderr.write(`${pc.red(SYM.cross)} ${msg}\n`);
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Execute an async function with a spinner. Retries automatically on 429.
 * On failure, calls outputError which exits — so this never returns on error.
 */
export async function withSpinner<T>(
  interactive: boolean,
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = createSpinner(interactive);
  spinner.start(message);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      spinner.stop(message);
      return result;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = (err as { response?: { headers?: Record<string, string> } })
          .response?.headers?.['retry-after'];
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, attempt);
        spinner.update(`Rate limited, retrying in ${Math.round(waitMs / 1000)}s...`);
        await delay(waitMs);
        spinner.update(message);
        continue;
      }
      spinner.fail(message);
      throw err;
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error('Max retries exceeded');
}
