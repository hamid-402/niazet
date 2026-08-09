import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/components/theme-provider';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/themes';

const vazirmatn = Vazirmatn({
  variable: '--font-vazirmatn',
  subsets: ['arabic', 'latin'],
});

export const metadata: Metadata = {
  title: 'نیازت با ما',
  description: 'سامانه خدمات مدیریت‌شده «نیازت با ما»',
};

// Runs before hydration/paint to apply the persisted theme and prevent a
// flash-of-wrong-theme (FOUC). Kept tiny and inline on purpose.
const NO_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var v=t||${JSON.stringify(DEFAULT_THEME)};document.documentElement.setAttribute('data-theme',v);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
