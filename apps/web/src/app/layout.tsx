import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/components/theme-provider';
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from '@/lib/themes';
import { NetworkStatus } from '@/components/network-status';
import { RouteTransition } from '@/components/route-transition';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

const vazirmatn = Vazirmatn({
  variable: '--font-vazirmatn',
  subsets: ['arabic', 'latin'],
});

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: `${SITE_NAME} | خدمات تخصصی مدیریت‌شده`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: SITE_NAME,
    title: `${SITE_NAME} | خدمات تخصصی مدیریت‌شده`,
    description: SITE_DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary',
    title: `${SITE_NAME} | خدمات تخصصی مدیریت‌شده`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

// Runs before hydration/paint to apply the persisted theme and prevent a
// flash-of-wrong-theme (FOUC). Kept tiny and inline on purpose.
const NO_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var a=${JSON.stringify(THEMES.map((theme) => theme.id))};var v=a.indexOf(t)>-1?t:${JSON.stringify(DEFAULT_THEME)};document.documentElement.setAttribute('data-theme',v);}catch(e){document.documentElement.setAttribute('data-theme',${JSON.stringify(DEFAULT_THEME)});}})();`;

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
        <a href="#main-content" className="skip-link">
          رفتن به محتوای اصلی
        </a>
        <ThemeProvider>
          <AuthProvider><RouteTransition>{children}</RouteTransition></AuthProvider>
          <NetworkStatus />
        </ThemeProvider>
      </body>
    </html>
  );
}
