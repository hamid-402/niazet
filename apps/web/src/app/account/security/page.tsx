"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";
import { roleHomePath } from "@/lib/role-paths";

interface ActiveSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "دستگاه ناشناس";
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "مرورگر";
  const system = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Android")
      ? "Android"
      : userAgent.includes("iPhone") || userAgent.includes("iPad")
        ? "iOS"
        : userAgent.includes("Mac OS")
          ? "macOS"
          : "دستگاه ناشناس";
  return `${browser} روی ${system}`;
}

export default function AccountSecurityPage() {
  return (
    <RequireRole roles={["customer", "executor", "support", "admin"]}>
      <SecurityContent />
    </RequireRole>
  );
}

function SecurityContent() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSessions(
        await apiFetch<ActiveSession[]>("/auth/sessions", { dedupe: false }),
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "دریافت نشست‌ها ممکن نشد.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function revoke(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ابطال نشست ممکن نشد.");
    } finally {
      setBusyId("");
    }
  }

  async function revokeOthers() {
    setBusyId("others");
    try {
      await apiFetch("/auth/sessions/others", { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ابطال نشست‌ها ممکن نشد.",
      );
    } finally {
      setBusyId("");
    }
  }

  const home = user ? roleHomePath(user) : "/";
  const otherSessions = sessions.filter((session) => !session.isCurrent);

  return (
    <AppShell
      navItems={[
        { href: home, label: "بازگشت به پنل" },
        { href: "/account/security", label: "حساب و امنیت" },
      ]}
      title="حساب و امنیت"
    >
      <SectionTitle subtitle="دستگاه‌هایی را که به حساب شما دسترسی دارند مشاهده و کنترل کنید.">
        نشست‌های فعال
      </SectionTitle>
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}
      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-fg">کنترل دسترسی حساب</p>
              <p className="mt-1 text-sm text-fg-muted">
                {sessions.length.toLocaleString("fa-IR")} نشست فعال شناسایی شد.
              </p>
            </div>
            <Button
              type="button"
              variant="danger"
              disabled={!otherSessions.length || busyId === "others"}
              onClick={() => void revokeOthers()}
            >
              {busyId === "others"
                ? "در حال ابطال..."
                : "خروج از همه دستگاه‌های دیگر"}
            </Button>
          </Card>

          <div className="grid gap-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-fg">
                      {deviceLabel(session.userAgent)}
                    </p>
                    {session.isCurrent && (
                      <Badge color="green">همین دستگاه</Badge>
                    )}
                  </div>
                  <p
                    dir="ltr"
                    className="mt-1 text-right text-xs text-fg-subtle"
                  >
                    IP: {session.ipAddress ?? "ثبت نشده"}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">
                    شروع یا آخرین تمدید: {formatDate(session.createdAt)} · انقضا:{" "}
                    {formatDate(session.expiresAt)}
                  </p>
                </div>
                {!session.isCurrent && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === session.id}
                    onClick={() => void revoke(session.id)}
                  >
                    {busyId === session.id ? "در حال ابطال..." : "ابطال دسترسی"}
                  </Button>
                )}
              </Card>
            ))}
          </div>
          <p className="text-xs leading-6 text-fg-subtle">
            توکن دسترسی کوتاه‌عمر است، Refresh Token در Cookie امن و HttpOnly
            نگهداری می‌شود و با هر تمدید می‌چرخد. استفاده مجدد از توکن قدیمی، کل
            زنجیره همان نشست را باطل می‌کند.
          </p>
        </div>
      )}
    </AppShell>
  );
}
