"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, downloadAuthenticated } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionTitle,
  TabList,
} from "@/components/ui";
import { formatDate, formatNumber, formatToman } from "@/lib/format";

type FinanceTab = "overview" | "payments" | "escrow" | "refunds" | "invoices" | "wallet";

interface OrderReference {
  id: string;
  code: string;
  title: string;
}

interface FinanceOverview {
  summary: {
    walletBalance: number;
    totalPaid: number;
    totalHeld: number;
    totalRefunded: number;
    pendingPaymentCount: number;
  };
  wallet: {
    balance: number;
    currency: string;
    transactions: Array<{
      id: string;
      direction: "debit" | "credit";
      amount: number;
      balanceAfter: number;
      referenceType: string;
      createdAt: string;
    }>;
  };
  payments: Array<{
    id: string;
    amount: number;
    gateway: string;
    gatewayRef: string | null;
    status: string;
    failureReason: string | null;
    verifiedAt: string | null;
    createdAt: string;
    order: OrderReference;
    milestone: { title: string; sequence: number } | null;
  }>;
  escrows: Array<{
    id: string;
    amount: number;
    releasedAmount: number;
    refundedAmount: number;
    remainingAmount: number;
    status: string;
    heldAt: string;
    order: OrderReference;
  }>;
  refunds: Array<{
    id: string;
    amount: number;
    reason: string;
    status: string;
    createdAt: string;
    order: OrderReference;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    issuedAt: string;
    emailSentAt: string | null;
    billingSnapshot: unknown;
    order: OrderReference;
  }>;
  ordersNeedingPayment: Array<
    OrderReference & { finalPrice: number | null; updatedAt: string }
  >;
}

const TABS: Array<{ id: FinanceTab; label: string }> = [
  { id: "overview", label: "خلاصه" },
  { id: "payments", label: "پرداخت‌ها" },
  { id: "escrow", label: "حساب امانی" },
  { id: "refunds", label: "بازپرداخت‌ها" },
  { id: "invoices", label: "فاکتورها" },
  { id: "wallet", label: "گردش کیف پول" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  verifying: "در حال تأیید",
  succeeded: "موفق",
  failed: "ناموفق",
  refunded: "بازپرداخت‌شده",
  held: "در امانت",
  partially_released: "بخشی آزادشده",
  released: "آزادشده",
  partially_refunded: "بخشی بازپرداخت‌شده",
  settled: "تسویه ترکیبی",
  processed: "پردازش‌شده",
  approved: "تأییدشده",
  rejected: "ردشده",
};

function statusColor(status: string): "gray" | "blue" | "yellow" | "green" | "red" | "purple" {
  if (["succeeded", "released", "processed", "approved"].includes(status)) return "green";
  if (["failed", "rejected"].includes(status)) return "red";
  if (["held", "partially_released", "partially_refunded", "settled"].includes(status)) return "purple";
  if (["pending", "verifying"].includes(status)) return "yellow";
  return "gray";
}

function StatusBadge({ status }: { status: string }) {
  return <Badge color={statusColor(status)}>{STATUS_LABELS[status] ?? status}</Badge>;
}

export default function WalletPage() {
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [error, setError] = useState("");
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState("");

  useEffect(() => {
    apiFetch<FinanceOverview>("/customer/finance/overview", { dedupe: false })
      .then(setData)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "دریافت اطلاعات مالی ممکن نشد."),
      );
  }, []);

  async function downloadInvoice(invoice: FinanceOverview["invoices"][number]) {
    setDownloadingInvoiceId(invoice.id);
    setError("");
    try {
      await downloadAuthenticated(
        `/customer/invoices/${invoice.id}/pdf`,
        `${invoice.invoiceNumber}.pdf`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "دریافت فاکتور ممکن نشد.");
    } finally {
      setDownloadingInvoiceId("");
    }
  }

  return (
    <div>
      <SectionTitle subtitle="تصویر شفاف از پرداخت، وجه امانی، بازپرداخت و اسناد مالی">
        امور مالی من
      </SectionTitle>
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {!data && !error && <PageLoading />}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card>
              <p className="text-xs text-fg-subtle">موجودی کیف پول</p>
              <p className="mt-2 text-lg font-extrabold text-fg">{formatToman(data.summary.walletBalance)}</p>
            </Card>
            <Card>
              <p className="text-xs text-fg-subtle">کل پرداخت موفق</p>
              <p className="mt-2 text-lg font-extrabold text-success">{formatToman(data.summary.totalPaid)}</p>
            </Card>
            <Card>
              <p className="text-xs text-fg-subtle">وجه فعلاً در امانت</p>
              <p className="mt-2 text-lg font-extrabold text-purple">{formatToman(data.summary.totalHeld)}</p>
            </Card>
            <Card>
              <p className="text-xs text-fg-subtle">بازپرداخت نهایی</p>
              <p className="mt-2 text-lg font-extrabold text-info">{formatToman(data.summary.totalRefunded)}</p>
            </Card>
            <Card>
              <p className="text-xs text-fg-subtle">نیازمند پرداخت</p>
              <p className="mt-2 text-lg font-extrabold text-warning">{formatNumber(data.summary.pendingPaymentCount)}</p>
            </Card>
          </div>

          {data.ordersNeedingPayment.length > 0 && (
            <Card className="mb-5 border-warning-border bg-warning-subtle">
              <h3 className="font-extrabold text-warning">سفارش‌های آماده پرداخت</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {data.ordersNeedingPayment.map((order) => (
                  <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between rounded-control border border-warning-border bg-surface px-3 py-3 text-sm hover:border-border-strong">
                    <span><b className="block text-fg">{order.title}</b><span className="text-xs text-fg-muted">{order.code}</span></span>
                    <span className="font-bold text-warning">{formatToman(order.finalPrice)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <TabList idPrefix="finance" label="بخش‌های مالی" items={TABS.map((item) => ({ value: item.id, label: item.label }))} value={tab} onChange={(value) => setTab(value as FinanceTab)} />

          {tab === "overview" && (
            <div role="tabpanel" id="finance-panel-overview" aria-labelledby="finance-tab-overview" tabIndex={0} className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h3 className="mb-3 font-extrabold text-fg">آخرین پرداخت‌ها</h3>
                {data.payments.length ? data.payments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                    <div><Link href={`/orders/${payment.order.id}`} className="text-sm font-bold text-fg hover:text-accent">{payment.order.title}</Link><p className="mt-1 text-xs text-fg-subtle">{payment.order.code} · {formatDate(payment.createdAt)}</p></div>
                    <div className="text-left"><p className="text-sm font-bold text-fg">{formatToman(payment.amount)}</p><StatusBadge status={payment.status} /></div>
                  </div>
                )) : <EmptyState title="پرداختی ثبت نشده است." />}
              </Card>
              <Card>
                <h3 className="mb-3 font-extrabold text-fg">منطق حساب امانی</h3>
                <ol className="space-y-3 text-sm leading-7 text-fg-muted">
                  <li><b className="text-fg">۱.</b> پرداخت موفق ابتدا وارد حساب امانی پلتفرم می‌شود.</li>
                  <li><b className="text-fg">۲.</b> تا تحویل و تأیید، وجه برای مجری آزاد نمی‌شود.</li>
                  <li><b className="text-fg">۳.</b> در صورت رأی بازپرداخت، مبلغ به کیف پول شما برمی‌گردد.</li>
                  <li><b className="text-fg">۴.</b> هر تغییر مالی با Ledger دوبل و Audit ثبت می‌شود.</li>
                </ol>
              </Card>
            </div>
          )}

          {tab === "payments" && (
            <Card role="tabpanel" id="finance-panel-payments" aria-labelledby="finance-tab-payments" tabIndex={0}>
              <h3 className="mb-3 font-extrabold text-fg">تاریخچه پرداخت سفارش‌ها</h3>
              {data.payments.length ? (
                <div className="space-y-3">
                  {data.payments.map((payment) => (
                    <div key={payment.id} className="grid gap-3 rounded-control border border-border p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div><Link href={`/orders/${payment.order.id}`} className="font-bold text-fg hover:text-accent">{payment.order.title}</Link><p className="mt-1 text-xs text-fg-muted">{payment.order.code}{payment.milestone ? ` · مرحله ${payment.milestone.sequence}: ${payment.milestone.title}` : ""}</p><p className="mt-1 text-xs text-fg-subtle">درگاه {payment.gateway} · {formatDate(payment.createdAt)}</p>{payment.failureReason && <p className="mt-2 text-xs text-danger">علت ناموفق بودن: {payment.failureReason}</p>}</div>
                      <p className="font-extrabold text-fg">{formatToman(payment.amount)}</p>
                      <StatusBadge status={payment.status} />
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="هنوز پرداختی ثبت نشده است." />}
            </Card>
          )}

          {tab === "escrow" && (
            <Card role="tabpanel" id="finance-panel-escrow" aria-labelledby="finance-tab-escrow" tabIndex={0}>
              <h3 className="mb-3 font-extrabold text-fg">وجوه حساب امانی</h3>
              {data.escrows.length ? (
                <div className="space-y-4">
                  {data.escrows.map((escrow) => {
                    const releasedPercent = Math.round((escrow.releasedAmount / escrow.amount) * 100);
                    const refundedPercent = Math.round((escrow.refundedAmount / escrow.amount) * 100);
                    return (
                      <div key={escrow.id} className="rounded-control border border-border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/orders/${escrow.order.id}`} className="font-bold text-fg hover:text-accent">{escrow.order.title}</Link><p className="mt-1 text-xs text-fg-muted">{escrow.order.code} · نگهداری از {formatDate(escrow.heldAt)}</p></div><StatusBadge status={escrow.status} /></div>
                        <div className="mt-4 flex h-3 overflow-hidden rounded-pill bg-bg-subtle" aria-label="توزیع مبلغ حساب امانی"><div className="bg-success" style={{ width: `${releasedPercent}%` }} /><div className="bg-info" style={{ width: `${refundedPercent}%` }} /></div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><p className="text-fg-muted">در امانت<br /><b className="text-purple">{formatToman(escrow.remainingAmount)}</b></p><p className="text-fg-muted">آزادشده<br /><b className="text-success">{formatToman(escrow.releasedAmount)}</b></p><p className="text-fg-muted">بازپرداخت<br /><b className="text-info">{formatToman(escrow.refundedAmount)}</b></p></div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="وجهی در حساب امانی وجود ندارد." />}
            </Card>
          )}

          {tab === "refunds" && (
            <Card role="tabpanel" id="finance-panel-refunds" aria-labelledby="finance-tab-refunds" tabIndex={0}>
              <h3 className="mb-3 font-extrabold text-fg">سوابق بازپرداخت</h3>
              {data.refunds.length ? data.refunds.map((refund) => (
                <div key={refund.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 last:border-0"><div><Link href={`/orders/${refund.order.id}`} className="font-bold text-fg hover:text-accent">{refund.order.title}</Link><p className="mt-1 text-sm text-fg-muted">{refund.reason}</p><p className="mt-1 text-xs text-fg-subtle">{refund.order.code} · {formatDate(refund.createdAt)}</p></div><div className="text-left"><p className="font-extrabold text-info">{formatToman(refund.amount)}</p><StatusBadge status={refund.status} /></div></div>
              )) : <EmptyState title="بازپرداختی برای حساب شما ثبت نشده است." />}
            </Card>
          )}

          {tab === "invoices" && (
            <Card role="tabpanel" id="finance-panel-invoices" aria-labelledby="finance-tab-invoices" tabIndex={0}>
              <h3 className="mb-3 font-extrabold text-fg">فاکتورهای صادرشده</h3>
              {data.invoices.length ? data.invoices.map((invoice) => (
                <div key={invoice.id} className="grid gap-3 border-b border-border py-4 last:border-0 md:grid-cols-[1fr_auto_auto] md:items-center"><div><p className="font-bold text-fg">{invoice.invoiceNumber}</p><Link href={`/orders/${invoice.order.id}`} className="mt-1 block text-sm text-fg-muted hover:text-accent">{invoice.order.title} · {invoice.order.code}</Link><p className="mt-1 text-xs text-fg-subtle">صدور: {formatDate(invoice.issuedAt)}</p></div><p className="font-extrabold text-fg">{formatToman(invoice.amount)}</p><Button type="button" variant="secondary" disabled={downloadingInvoiceId === invoice.id} onClick={() => void downloadInvoice(invoice)}>{downloadingInvoiceId === invoice.id ? "در حال دریافت..." : "دانلود PDF"}</Button></div>
              )) : <EmptyState title="فاکتوری صادر نشده است." />}
            </Card>
          )}

          {tab === "wallet" && (
            <Card role="tabpanel" id="finance-panel-wallet" aria-labelledby="finance-tab-wallet" tabIndex={0}>
              <div className="mb-4 flex items-center justify-between"><h3 className="font-extrabold text-fg">گردش کیف پول</h3><p className="text-lg font-extrabold text-fg">{formatToman(data.wallet.balance)}</p></div>
              {data.wallet.transactions.length ? data.wallet.transactions.map((transaction) => (
                <div key={transaction.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border py-3 last:border-0"><div><p className="text-sm font-bold text-fg">{transaction.referenceType}</p><p className="mt-1 text-xs text-fg-subtle">{formatDate(transaction.createdAt)} · مانده پس از تراکنش: {formatToman(transaction.balanceAfter)}</p></div><p className={`font-extrabold ${transaction.direction === "credit" ? "text-success" : "text-danger"}`}>{transaction.direction === "credit" ? "+" : "−"}{formatToman(transaction.amount)}</p></div>
              )) : <EmptyState title="هنوز تراکنشی در کیف پول ثبت نشده است." />}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
