'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ResponsiveTable,
  Card,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { OrderSummary } from '@/lib/types';
import { formatDate, formatToman } from '@/lib/format';
import {
  ActionMenu,
  actionMenuItemClass,
  Breadcrumbs,
  FilterSelect,
  ListToolbar,
  Pagination,
  SearchField,
  SortSelect,
} from '@/components/list-controls';

const PAGE_SIZE = 10;
const STATUS_OPTIONS = [
  { value: '', label: 'همه وضعیت‌ها' },
  { value: 'submitted', label: 'ثبت‌شده' },
  { value: 'pending_triage', label: 'در انتظار بررسی' },
  { value: 'pending_payment', label: 'در انتظار پرداخت' },
  { value: 'in_progress', label: 'در حال اجرا' },
  { value: 'submitted_for_qc', label: 'در کنترل کیفیت' },
  { value: 'ready_for_customer_review', label: 'آماده بررسی مشتری' },
  { value: 'delivered', label: 'تحویل‌شده' },
  { value: 'disputed', label: 'دارای اختلاف' },
  { value: 'closed', label: 'بسته‌شده' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'جدیدترین' },
  { value: 'oldest', label: 'قدیمی‌ترین' },
  { value: 'amount_desc', label: 'بیشترین مبلغ' },
  { value: 'amount_asc', label: 'کمترین مبلغ' },
] as const;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const query = deferredSearch ? `?search=${encodeURIComponent(deferredSearch)}` : '';
    apiFetch<OrderSummary[]>(`/admin/orders${query}`)
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, [deferredSearch]);

  const filteredOrders = useMemo(() => {
    const result = [...(orders ?? [])].filter((order) => !statusFilter || order.status === statusFilter);
    result.sort((first, second) => {
      if (sort === 'oldest') return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
      if (sort === 'amount_desc') return (second.finalPrice ?? 0) - (first.finalPrice ?? 0);
      if (sort === 'amount_asc') return (first.finalPrice ?? 0) - (second.finalPrice ?? 0);
      return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
    });
    return result;
  }, [orders, sort, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const visibleOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <Breadcrumbs items={[{ label: 'داشبورد عملیات', href: '/admin' }, { label: 'مدیریت سفارش‌ها' }]} />
      <SectionTitle>مدیریت سفارش‌ها</SectionTitle>
      <ListToolbar>
        <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="کد یا عنوان سفارش..." />
        <FilterSelect label="وضعیت" options={STATUS_OPTIONS} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} />
        <SortSelect options={SORT_OPTIONS} value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} />
      </ListToolbar>

      {error && <ErrorBanner message={error} />}
      {!orders && !error && <PageLoading />}
      {orders && filteredOrders.length === 0 && <EmptyState title="سفارشی یافت نشد." description="عبارت جست‌وجو یا فیلتر وضعیت را تغییر دهید." />}

      {orders && filteredOrders.length > 0 && (
        <>
        <Card className="overflow-x-auto p-0">
          <ResponsiveTable className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
                <th className="px-4 py-3 font-medium">کد و عنوان</th>
                <th className="px-4 py-3 font-medium">مشتری</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">مبلغ</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
                <th className="px-4 py-3 font-medium">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border last:border-0 hover:bg-bg-subtle"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {order.title}
                    </Link>
                    <p className="text-xs text-fg-subtle">{order.code}</p>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {(order as unknown as { customer?: { fullName: string } })
                      .customer?.fullName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {formatToman(order.finalPrice)}
                  </td>
                  <td className="px-4 py-3 text-fg-subtle">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ActionMenu>
                      <Link href={`/admin/orders/${order.id}`} className={actionMenuItemClass}>مشاهده و مدیریت</Link>
                    </ActionMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </Card>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
