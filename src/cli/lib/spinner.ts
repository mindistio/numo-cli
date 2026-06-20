import { makeClackSpinner } from './quiet';

// Thin wrapper over @clack/prompts' spinner. Retries are NOT handled here —
// the HTTP layer (http.ts) already retries 429/5xx with backoff + retry-after.
export async function withSpinner<T>(interactive: boolean, message: string, fn: () => Promise<T>): Promise<T> {
  const spinner = await makeClackSpinner(!interactive);
  spinner.start(message);
  try {
    const result = await fn();
    spinner.stop(message);
    return result;
  } catch (err) {
    spinner.stop(message, 2);
    throw err;
  }
}
