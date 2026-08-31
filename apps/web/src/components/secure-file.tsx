"use client";

import { useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui";
import type { OrderFile } from "@/lib/types";
import { formatFileSize } from "@/lib/format";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_TYPES =
  ".pdf,.zip,.doc,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv";

export function SecureFileUpload({
  orderId,
  fileKind,
  label = "افزودن فایل",
  disabled = false,
  onUploaded,
}: {
  orderId: string;
  fileKind:
    | "input"
    | "output"
    | "revision"
    | "message_attachment"
    | "ticket_attachment"
    | "report";
  label?: string;
  disabled?: boolean;
  onUploaded: (file: OrderFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError("");
    if (file.size > MAX_FILE_SIZE) {
      setError("حجم فایل نباید بیشتر از ۲۵ مگابایت باشد.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    body.append("orderId", orderId);
    body.append("fileKind", fileKind);
    setUploading(true);
    try {
      const uploaded = await apiFetch<OrderFile>("/files/upload", {
        method: "POST",
        body,
        isFormData: true,
        retry: 0,
      });
      onUploaded(uploaded);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "آپلود فایل ممکن نشد.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "در حال بررسی و آپلود…" : label}
      </Button>
      <p className="mt-1 text-xs text-fg-muted">
        PDF، Office، ZIP، تصویر، TXT یا CSV؛ حداکثر ۲۵ مگابایت
      </p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function SecureFileLink({
  file,
  label,
}: {
  file: OrderFile;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setLoading(true);
    setError("");
    try {
      const grant = await apiFetch<{ url: string }>(
        `/files/${file.id}/signed-url`,
      );
      const token = new URL(grant.url, window.location.origin).searchParams.get(
        "token",
      );
      if (!token) throw new Error("مجوز دانلود معتبر نیست.");
      window.location.assign(
        `/api/backend/files/download?token=${encodeURIComponent(token)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "دریافت فایل ممکن نشد.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={loading}
        className="text-sm font-bold text-accent hover:underline disabled:opacity-50"
      >
        {loading ? "در حال دریافت مجوز…" : (label ?? file.originalName)}
      </button>
      <span className="me-2 text-xs text-fg-muted">
        {formatFileSize(file.sizeBytes)}
      </span>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
