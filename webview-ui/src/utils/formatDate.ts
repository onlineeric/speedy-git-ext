import { format as dateFnsFormat } from 'date-fns';
import type { UserDateFormat } from '@shared/types';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < MINUTE) {
    return 'just now';
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes}m ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }

  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }

  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return `${weeks}w ago`;
  }

  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return `${months}mo ago`;
  }

  const years = Math.floor(diff / YEAR);
  return `${years}y ago`;
}

export function formatAbsoluteDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatAbsoluteDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatSystemDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(timestamp: number): string {
  return formatAbsoluteDateTime(timestamp);
}

export type DateFormatter = (timestamp: number) => string;

let cachedKey: string | null = null;
let cachedFormatter: DateFormatter = formatRelativeDate;

/**
 * Returns a memoized formatter for the given user-settings pair. The same
 * (format, customToken) combination yields the same function reference on
 * subsequent calls, so consumers can call this once per render without
 * re-validating the date-fns token.
 */
export function getDateFormatter(format: UserDateFormat, customToken: string = ''): DateFormatter {
  const key = `${format}|${customToken}`;
  if (key === cachedKey) return cachedFormatter;
  cachedKey = key;
  cachedFormatter = buildFormatter(format, customToken);
  return cachedFormatter;
}

function buildFormatter(format: UserDateFormat, customToken: string): DateFormatter {
  switch (format) {
    case 'absolute':
      return formatAbsoluteDateTime;
    case 'absolute-date':
      return formatAbsoluteDate;
    case 'system':
      return formatSystemDateTime;
    case 'custom':
      return buildCustomFormatter(customToken);
    case 'relative':
    default:
      return formatRelativeDate;
  }
}

function buildCustomFormatter(token: string): DateFormatter {
  const trimmed = token.trim();
  if (trimmed === '') return formatRelativeDate;
  try {
    dateFnsFormat(new Date(), trimmed);
  } catch {
    return formatRelativeDate;
  }
  return (timestamp) => {
    try {
      return dateFnsFormat(new Date(timestamp), trimmed);
    } catch {
      return formatRelativeDate(timestamp);
    }
  };
}
