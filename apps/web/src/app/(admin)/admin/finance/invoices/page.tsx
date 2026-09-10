'use client';

import { useEffect, useState } from 'react';
import { apiFetch, downloadAuthenticated } from '@/lib/api';
import { ResponsiveTable, Button, Card, EmptyState, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate, formatToman } from '@/lib/format';

type Invoice = {
  id: string;
  invoiceNumber: string;
  amount: number;
  issuedAt: string;
  emailSentAt: string | null;
  order: { code: string };
  customer: { fullName: string };
};

export default function AdminInvoicesPage() {
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    apiFetch<Invoice[]>('/admin/finance/invoices')
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);

  async function download(invoice: Invoice) {
    setDownloading(invoice.id);
    setError('');
    try {
      await downloadAuthenticated(
        `/admin/finance/invoices/${invoice.id}/pdf`,
        `${invoice.invoiceNumber}.pdf`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دریافت فاکتور ممکن نشد.');
    } finally {
      setDownloading('');
    }
  }

  return <div>
    <SectionTitle subtitle="فاکتورهای صادرشده پس از پرداخت موفق">فاکتورها</SectionTitle>
    {error && <ErrorBanner message={error} />}
    {!items && !error && <PageLoading />}
    {items?.length === 0 && <EmptyState title="فاکتوری صادر نشده است." />}
    {items && items.length > 0 && <Card className="overflow-x-auto p-0">
      <ResponsiveTable className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b border-border text-right text-xs text-fg-subtle">
          <th className="px-4 py-3 font-medium">شماره فاکتور</th>
          <th className="px-4 py-3 font-medium">سفارش</th>
          <th className="px-4 py-3 font-medium">مشتری</th>
          <th className="px-4 py-3 font-medium">مبلغ</th>
          <th className="px-4 py-3 font-medium">تاریخ صدور</th>
          <th className="px-4 py-3 font-medium">فایل</th>
        </tr></thead>
        <tbody>{items.map((invoice) => <tr key={invoice.id} className="border-b border-border last:border-0">
          <td className="px-4 py-3 font-medium text-fg" dir="ltr">{invoice.invoiceNumber}</td>
          <td className="px-4 py-3 text-fg-muted" dir="ltr">{invoice.order.code}</td>
          <td className="px-4 py-3 text-fg-muted">{invoice.customer.fullName}</td>
          <td className="px-4 py-3 text-fg">{formatToman(invoice.amount)}</td>
          <td className="px-4 py-3 text-fg-subtle">{formatDate(invoice.issuedAt)}</td>
          <td className="px-4 py-3"><Button variant="secondary" disabled={downloading === invoice.id} onClick={() => void download(invoice)}>{downloading === invoice.id ? 'در حال دریافت...' : 'دانلود PDF'}</Button></td>
        </tr>)}</tbody>
      </ResponsiveTable>
    </Card>}
  </div>;
}
