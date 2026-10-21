export type ThemeId = 'simple-light' | 'simple-dark';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  isDark: boolean;
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'simple-light',
    label: 'لاجورد و عسل — روشن',
    description: 'روشن، گرم و حرفه‌ای با تأکیدهای عسلی',
    isDark: false,
  },
  {
    id: 'simple-dark',
    label: 'لاجورد و عسل — تیره',
    description: 'لاجوردی عمیق با طلایی و فیروزه‌ای کنترل‌شده',
    isDark: true,
  },
];

export const DEFAULT_THEME: ThemeId = 'simple-light';

export const THEME_STORAGE_KEY = 'niazat-theme';

export function isThemeId(value: string | null): value is ThemeId {
  return !!value && THEMES.some((t) => t.id === value);
}
