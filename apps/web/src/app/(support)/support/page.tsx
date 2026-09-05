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
          ["صف بدون مسئول", data.unassigned, "text-info"],
          ["تیکت‌های من", data.mine, "text-success"],
          ["ریسک SLA تا یک ساعت", data.slaAtRisk, "text-warning"],
          ["SLA عبورکرده", data.breached, "text-danger"],
        ].map(([label, value, color]) => (
          <Card key={String(label)}>
            <p className="text-xs text-fg-muted">{label}</p>
            <p className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-fg">اقدام‌های بعدی من</h2>
          <Link href="/support/tickets?view=mine" className="text-sm text-success">
            همه تیکت‌های من
          </Link>
        </div>
        {data.nextTickets.length ? (
          <div className="divide-y divide-border">
            {data.nextTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/support/tickets/${ticket.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-fg">{ticket.subject}</p>
                  <p className="text-xs text-fg-subtle">{ticket.code}</p>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">تیکت فعالی به شما تخصیص ندارد.</p>
        )}
      </Card>
    </div>
  );
}
