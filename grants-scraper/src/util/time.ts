/**
 * Convert a date string (YYYY-MM-DD) to ISO string at start of day (UTC).
 */
export function toStartOfDayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d.toISOString();
}

/**
 * Convert a date string (YYYY-MM-DD) to ISO string at end of day (UTC).
 */
export function toEndOfDayISO(dateStr: string): string {
  const d = new Date(dateStr + "T23:59:59.999Z");
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d.toISOString();
}

/**
 * Parse a date string to ISO (UTC). Accepts various formats.
 */
export function toISOString(dateStr: string | Date | null | undefined): string | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    return dateStr.toISOString();
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Get current ISO timestamp (UTC).
 */
export function nowISO(): string {
  return new Date().toISOString();
}

