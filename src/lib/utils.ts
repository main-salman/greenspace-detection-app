/**
 * Safe number/date formatting utilities
 */
import { parseISO, formatDistanceToNow } from 'date-fns';

/**
 * Safely converts a value to a number and formats it with toFixed
 * @param value - The value to format
 * @param decimals - Number of decimal places (default: 1)
 * @param fallback - Fallback value if conversion fails (default: '0')
 * @returns Formatted string or fallback
 */
export function safeToFixed(value: any, decimals: number = 1, fallback: string = '0'): string {
  if (value == null || value === undefined || value === '') {
    return fallback;
  }
  
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return fallback;
  }
  
  try {
    return num.toFixed(decimals);
  } catch (error) {
    console.warn('safeToFixed error:', error, 'value:', value);
    return fallback;
  }
}

/**
 * Safely converts a value to a number
 * @param value - The value to convert
 * @param fallback - Fallback value if conversion fails (default: 0)
 * @returns Number or fallback
 */
export function safeNumber(value: any, fallback: number = 0): number {
  if (value == null || value === undefined || value === '') {
    return fallback;
  }
  
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return fallback;
  }
  
  return num;
}

/**
 * Safely formats a percentage value
 * @param value - The value to format as percentage
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function safePercentage(value: any, decimals: number = 1): string {
  const formatted = safeToFixed(value, decimals, '0');
  return `${formatted}%`;
}

/**
 * Safely formats a decimal value with optional percentage
 * @param value - The value to format
 * @param decimals - Number of decimal places (default: 3)
 * @param asPercentage - Whether to append % (default: false)
 * @returns Formatted string
 */
export function safeDecimal(value: any, decimals: number = 3, asPercentage: boolean = false): string {
  const formatted = safeToFixed(value, decimals, '0');
  return asPercentage ? `${formatted}%` : formatted;
}

/**
 * Robustly parses various date representations into a valid Date object.
 * Accepts Date instances, numbers (epoch ms), and ISO strings (with or without timezone/microseconds).
 * Returns null if the value cannot be parsed into a valid Date.
 */
export function safeParseDate(value: unknown): Date | null {
  try {
    if (!value && value !== 0) return null;
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const raw = value.trim();
      // If the string lacks timezone info, treat it as UTC to avoid locale quirks
      const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(raw);
      const candidate = hasTz ? raw : `${raw}Z`;
      try {
        const d = parseISO(candidate);
        return isNaN(d.getTime()) ? null : d;
      } catch {
        const d2 = new Date(candidate);
        return isNaN(d2.getTime()) ? null : d2;
      }
    }
    // Fallback attempt
    const d = new Date((value as any) ?? undefined);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Formats a value as a human "time ago" string, safely.
 * Falls back to 'just now' on invalid values.
 */
export function formatTimeAgo(value: unknown): string {
  const d = safeParseDate(value);
  if (!d) return 'just now';
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return 'just now';
  }
}
