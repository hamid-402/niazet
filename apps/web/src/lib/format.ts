export interface UserFormatPreferences {
  locale: string;
  calendar: string;
  numberingSystem: string;
  timeZone: string;
}

export const DEFAULT_USER_FORMAT_PREFERENCES: Readonly<UserFormatPreferences> = {
  locale: 'fa-IR',
  calendar: 'persian',
  numberingSystem: 'arabext',
  timeZone: 'Asia/Tehran',
};

function localeTag(preferences: UserFormatPreferences) {
  return `${preferences.locale}-u-ca-${preferences.calendar}-nu-${preferences.numberingSystem}`;
}

export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
  preferences: UserFormatPreferences = DEFAULT_USER_FORMAT_PREFERENCES,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(localeTag(preferences), options).format(value);
}

export function formatToman(
  amount: number | null | undefined,
  preferences: UserFormatPreferences = DEFAULT_USER_FORMAT_PREFERENCES,
): string {
  if (amount == null) return '—';
  return `${formatNumber(amount, {}, preferences)} تومان`;
}

function validDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | Date | null | undefined,
  preferences: UserFormatPreferences = DEFAULT_USER_FORMAT_PREFERENCES,
): string {
  const date = validDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(localeTag(preferences), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: preferences.timeZone,
  }).format(date);
}

export function formatDateOnly(
  value: string | Date | null | undefined,
  preferences: UserFormatPreferences = DEFAULT_USER_FORMAT_PREFERENCES,
): string {
  const date = validDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(localeTag(preferences), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: preferences.timeZone,
  }).format(date);
}

export function formatPercent(
  value: number | null | undefined,
  maximumFractionDigits = 2,
  preferences: UserFormatPreferences = DEFAULT_USER_FORMAT_PREFERENCES,
): string {
  return `${formatNumber(value, { maximumFractionDigits }, preferences)}٪`;
}

export function formatFileSize(
  bytes: number,
  preferences: UserFormatPreferences = DEFAULT_USER_FORMAT_PREFERENCES,
): string {
  if (bytes < 1024) return `${formatNumber(bytes, {}, preferences)} بایت`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.ceil(bytes / 1024), {}, preferences)} کیلوبایت`;
  return `${formatNumber(bytes / (1024 * 1024), { maximumFractionDigits: 1 }, preferences)} مگابایت`;
}
