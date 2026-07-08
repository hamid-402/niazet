import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider, themeInitScript } from '@/lib/theme-context';

const vazirmatn = Vazirmatn({
  variable: '--font-vazirmatn',
  subsets: ['arabic', 'latin'],
});

export const metadata: Metadata = {
  title: 'نیازت با ما',
  description: 'سامانه خدمات مدیریت‌شده «نیازت با ما»',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
