export const ORDER_SECTIONS = { summary: 'خلاصه', milestones: 'مراحل', reports: 'گزارش‌ها', files: 'فایل‌ها', messages: 'پیام‌ها', payments: 'پرداخت‌ها', tickets: 'تیکت‌ها', history: 'تاریخچه' } as const;
export type OrderSection = keyof typeof ORDER_SECTIONS;
export function readOrderSection(params: URLSearchParams): OrderSection {
  const values = params.getAll('tab'); const value = values.length === 1 ? values[0] : '';
  if (value === 'delivery') return 'files';
  return Object.hasOwn(ORDER_SECTIONS, value) ? value as OrderSection : 'summary';
}
export function updateCustomerQuery(search: string, key: 'tab' | 'checkout', value: string): string {
  const params = new URLSearchParams(search); params.set(key, value); return '?' + params.toString();
}
export function fixedCheckoutChoice(params: URLSearchParams): 'normal' | 'urgent' | 'same_day' | null {
  const values = params.getAll('checkout'); const value = values.length === 1 ? values[0] : '';
  return value === 'normal' || value === 'urgent' || value === 'same_day' ? value : null;
}
export const CUSTOMER_DESTINATIONS = { otp: '/login/otp', delivery: '/orders', wallet: '/wallet?tab=wallet', profile: '/account/profile', tickets: '/tickets' } as const;
