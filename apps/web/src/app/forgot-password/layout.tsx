import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'بازیابی رمز عبور', robots: { index: false, follow: false } };

export default function ForgotPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
