import * as chrono from 'chrono-node';

/**
 * Parse a human-friendly date string into YYYY-MM-DD HH:mm format.
 * Accepts: ISO dates, natural language ("tomorrow", "next monday", "in 3 days").
 * Returns null if parsing fails.
 */
export function parseHumanDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pass-through ISO-like dates (YYYY-MM-DD or YYYY-MM-DD HH:mm)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;

  const parsed = chrono.parseDate(trimmed, new Date(), { forwardDate: true });
  if (!parsed) return null;

  const date = parsed.toISOString().slice(0, 10);
  const hours = parsed.getHours();
  const mins = parsed.getMinutes();

  // Only include time if it was explicitly mentioned
  if (hours === 12 && mins === 0 && !/\d{1,2}:\d{2}|noon|12/.test(trimmed.toLowerCase())) {
    return date;
  }
  if (hours === 0 && mins === 0) return date;
  return `${date} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Parse to date-only YYYY-MM-DD format.
 */
export function parseHumanDateOnly(input: string): string | null {
  const result = parseHumanDate(input);
  if (!result) return null;
  return result.slice(0, 10);
}
