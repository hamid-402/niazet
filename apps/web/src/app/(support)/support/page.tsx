"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, ErrorBanner, PageLoading, SectionTitle } from "@/components/ui";
import { TicketStatusBadge } from "@/components/status-badge";
import type { Ticket } from "@/lib/types";

type Dashboard = {
  unassigned: number;
  mine: number;
  slaAtRisk: number;
  breached: number;
  nextTickets: Ticket[];
};

export default function SupportDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Dashboard>("/support/tickets/dashboard/summary")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;

  return (
    <div className="space-y-4">
      <SectionTitle>داشبورد پشتیبانی</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["صف بدون مسئول", data.unassigned, "text-sky-700"],
          ["تیکت‌های من", data.mine, "text-emerald-700"],
          ["ریسک SLA تا یک ساعت", data.slaAtRisk, "text-amber-700"],
          ["SLA عبورکرده", data.breached, "text-rose-700"],
        ].map(([label, value, color]) => (
          <Card key={String(label)}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">اقدام‌های بعدی من</h2>
          <Link href="/support/tickets?view=mine" className="text-sm text-emerald-700">
            همه تیکت‌های من
          </Link>
        </div>
        {data.nextTickets.length ? (
          <div className="divide-y divide-slate-100">
            {data.nextTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/support/tickets/${ticket.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-slate-800">{ticket.subject}</p>
                  <p className="text-xs text-slate-400">{ticket.code}</p>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">تیکت فعالی به شما تخصیص ندارد.</p>
        )}
      </Card>
    </div>
  );
}
