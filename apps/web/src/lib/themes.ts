export type ThemeId = 'simple-light' | 'simple-dark' | 'fluent' | 'linear';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  isDark: boolean;
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'simple-light',
    label: 'ساده روشن',
    description: 'پس‌زمینه روشن، خوانایی بالا، مناسب استفاده روزانه',
    isDark: false,
  },
  {
    id: 'simple-dark',
    label: 'ساده تیره',
    description: 'پس‌زمینه تیره، کم‌خستگی برای چشم در محیط‌های کم‌نور',
    isDark: true,
  },
  {
    id: 'fluent',
    label: 'فلوئنت',
    description: 'الهام از طراحی مایکروسافت فلوئنت؛ آبی-خاکستری و شیشه‌ای',
    isDark: false,
  },
  {
    id: 'linear',
    label: 'لینیر',
    description:
      'الهام از Linear/Vercel؛ تیره، کنتراست بالا و مینیمال تکنولوژیک',
    isDark: true,
  },
];

export const DEFAULT_THEME: ThemeId = 'simple-light';

export const THEME_STORAGE_KEY = 'niazat-theme';

export function isThemeId(value: string | null): value is ThemeId {
  return !!value && THEMES.some((t) => t.id === value);
}
