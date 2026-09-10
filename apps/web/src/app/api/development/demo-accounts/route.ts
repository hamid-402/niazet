import { NextResponse } from 'next/server';

const DEMO_ACCOUNTS = [
  { label: 'مدیر کل', phone: '09120000001' },
  { label: 'مدیر عملیات', phone: '09120000002' },
  { label: 'مدیر مالی', phone: '09120000003' },
  { label: 'پشتیبانی', phone: '09120000004' },
  { label: 'مجری', phone: '09120000005' },
  { label: 'مشتری', phone: '09120000009' },
] as const;

export async function GET() {
  const password = process.env.DEV_DEMO_PASSWORD;
  if (process.env.NODE_ENV !== 'development' || !password) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({
    accounts: DEMO_ACCOUNTS.map((account) => ({ ...account, password })),
  });
}
