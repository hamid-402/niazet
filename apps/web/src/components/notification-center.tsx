"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  eventType: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationPreference {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference | null>(
    null,
  );
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [notifications, preference] = await Promise.all([
        apiFetch<NotificationItem[]>("/notifications", { dedupe: false }),
        apiFetch<NotificationPreference>("/notifications/preferences", {
          dedupe: false,
        }),
      ]);
      setItems(notifications);
      setPreferences({
        inAppEnabled: preference.inAppEnabled,
        emailEnabled: preference.emailEnabled,
        smsEnabled: preference.smsEnabled,
      });
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "دریافت اعلان‌ها ممکن نشد.",
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = items.filter((item) => !item.readAt).length;

  async function markRead(item: NotificationItem) {
    if (item.readAt) return;
    await apiFetch(`/notifications/${item.id}/read`, { method: "PATCH" });
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, readAt: new Date().toISOString() }
          : entry,
      ),
    );
  }

  async function updatePreference(
    key: keyof NotificationPreference,
    value: boolean,
  ) {
    if (!preferences) return;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try {
      await apiFetch("/notifications/preferences", {
        method: "PUT",
        body: {
          inAppEnabled: next.inAppEnabled,
          emailEnabled: next.emailEnabled,
          smsEnabled: next.smsEnabled,
        },
      });
    } catch (cause) {
      setPreferences(preferences);
      setError(
        cause instanceof Error ? cause.message : "ذخیره تنظیم اعلان ممکن نشد.",
      );
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`اعلان‌ها${unread ? `، ${unread} خوانده‌نشده` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg hover:bg-bg-subtle"
      >
        اعلان‌ها
        {unread > 0 && (
          <span className="absolute -left-2 -top-2 min-w-5 rounded-pill bg-danger px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
            {unread.toLocaleString("fa-IR")}
          </span>
        )}
      </button>
      {open && (
        <section
          className="absolute left-0 z-overlay mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-4 shadow-elevation-4"
          aria-label="مرکز اعلان‌ها"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-extrabold text-fg">مرکز اعلان‌ها</h2>
            {unread > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="px-2 text-xs"
                onClick={async () => {
                  await apiFetch("/notifications/read-all", {
                    method: "PATCH",
                  });
                  setItems((current) =>
                    current.map((item) => ({
                      ...item,
                      readAt: item.readAt ?? new Date().toISOString(),
                    })),
                  );
                }}
              >
                خواندن همه
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="mb-2 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item)}
                  className={`block w-full rounded-control border p-3 text-right ${item.readAt ? "border-border bg-surface" : "border-info-border bg-info-subtle"}`}
                >
                  <span className="block text-sm font-bold text-fg">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-fg-muted">
                    {item.body}
                  </span>
                  <time className="mt-1 block text-[11px] text-fg-subtle">
                    {formatDate(item.createdAt)}
                  </time>
                </button>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-fg-muted">
                اعلانی ندارید.
              </p>
            )}
          </div>
          {preferences && (
            <fieldset className="mt-4 border-t border-border pt-3">
              <legend className="mb-2 text-xs font-bold text-fg">
                کانال‌های دریافت
              </legend>
              <div className="flex flex-wrap gap-4 text-xs text-fg-muted">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferences.inAppEnabled}
                    onChange={(event) =>
                      void updatePreference(
                        "inAppEnabled",
                        event.target.checked,
                      )
                    }
                  />
                  داخل سایت
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferences.emailEnabled}
                    onChange={(event) =>
                      void updatePreference(
                        "emailEnabled",
                        event.target.checked,
                      )
                    }
                  />
                  ایمیل
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferences.smsEnabled}
                    onChange={(event) =>
                      void updatePreference("smsEnabled", event.target.checked)
                    }
                  />
                  پیامک
                </label>
              </div>
              <p className="mt-2 text-[11px] text-fg-subtle">
                ایمیل و پیامک در لوکال با Driver آزمایشی ارسال می‌شوند.
              </p>
            </fieldset>
          )}
        </section>
      )}
    </div>
  );
}
