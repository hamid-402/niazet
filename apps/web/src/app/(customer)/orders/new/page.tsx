"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  inputClass,
  PageLoading,
  SectionTitle,
} from "@/components/ui";
import { SecureFileLink, SecureFileUpload } from "@/components/secure-file";
import type {
  OrderDetail,
  OrderFile,
  OrderSummary,
  ServiceFormField,
  ServiceLine,
} from "@/lib/types";

type FormValue = string | number | boolean | string[];
type DraftDetail = OrderDetail & {
  serviceLine: ServiceLine;
  acceptanceCriteria?: { description: string }[];
};
type DraftResult = { id: string; version: number };

function fieldConfig(options: unknown) {
  const record =
    options && typeof options === "object" && !Array.isArray(options)
      ? (options as Record<string, unknown>)
      : {};
  const rawChoices = Array.isArray(options)
    ? options
    : Array.isArray(record.choices)
      ? record.choices
      : Array.isArray(record.options)
        ? record.options
        : [];
  const choices = rawChoices.flatMap((item) => {
    if (typeof item === "string" || typeof item === "number")
      return [{ value: String(item), label: String(item) }];
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const choice = item as Record<string, unknown>;
      if (typeof choice.value === "string")
        return [
          {
            value: choice.value,
            label:
              typeof choice.label === "string" ? choice.label : choice.value,
          },
        ];
    }
    return [];
  });
  return {
    choices,
    placeholder:
      typeof record.placeholder === "string" ? record.placeholder : undefined,
    helpText: typeof record.helpText === "string" ? record.helpText : undefined,
    min: typeof record.min === "number" ? record.min : undefined,
    max: typeof record.max === "number" ? record.max : undefined,
    minLength:
      typeof record.minLength === "number" ? record.minLength : undefined,
    maxLength:
      typeof record.maxLength === "number" ? record.maxLength : undefined,
    pattern: typeof record.pattern === "string" ? record.pattern : undefined,
  };
}

function answersFromSnapshot(snapshot: unknown): Record<string, FormValue> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return {};
  const record = snapshot as Record<string, unknown>;
  if (!Array.isArray(record.fields)) return record as Record<string, FormValue>;
  return Object.fromEntries(
    record.fields.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const field = item as Record<string, unknown>;
      return typeof field.key === "string" && field.answer !== null
        ? [[field.key, field.answer as FormValue]]
        : [];
    }),
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: ServiceFormField;
  value: FormValue | undefined;
  onChange: (value: FormValue) => void;
}) {
  const config = fieldConfig(field.options);
  const shared = {
    id: `service-field-${field.id}`,
    name: field.fieldKey,
    required: field.required,
  };
  if (field.fieldType === "textarea") {
    return (
      <Field label={field.label} hint={config.helpText}>
        <textarea
          {...shared}
          className={`${inputClass} min-h-24`}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={config.placeholder}
          minLength={config.minLength}
          maxLength={config.maxLength}
        />
      </Field>
    );
  }
  if (field.fieldType === "select") {
    return (
      <Field label={field.label} hint={config.helpText}>
        <select
          {...shared}
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">انتخاب کنید</option>
          {config.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (field.fieldType === "radio") {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-fg">
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        {config.helpText && (
          <p className="mb-2 text-xs text-fg-muted">{config.helpText}</p>
        )}
        <div className="flex flex-wrap gap-3">
          {config.choices.map((choice) => (
            <label
              key={choice.value}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name={field.fieldKey}
                value={choice.value}
                checked={value === choice.value}
                onChange={() => onChange(choice.value)}
                required={field.required}
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (field.fieldType === "checkbox") {
    return (
      <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm text-fg">
        <input
          className="mt-1"
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          required={field.required}
        />
        <span>
          <b>{field.label}</b>
          {config.helpText && (
            <small className="mt-1 block text-fg-muted">
              {config.helpText}
            </small>
          )}
        </span>
      </label>
    );
  }
  if (field.fieldType === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-fg">
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        {config.helpText && (
          <p className="mb-2 text-xs text-fg-muted">{config.helpText}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {config.choices.map((choice) => (
            <label
              key={choice.value}
              className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(choice.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, choice.value]
                      : selected.filter((item) => item !== choice.value),
                  )
                }
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const type =
    field.fieldType === "number"
      ? "number"
      : field.fieldType === "date"
        ? "date"
        : field.fieldType === "email"
          ? "email"
          : field.fieldType === "url"
            ? "url"
            : "text";
  return (
    <Field label={field.label} hint={config.helpText}>
      <input
        {...shared}
        type={type}
        className={inputClass}
        value={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        onChange={(event) =>
          onChange(
            type === "number"
              ? event.target.value === ""
                ? ""
                : event.target.valueAsNumber
              : event.target.value,
          )
        }
        placeholder={config.placeholder}
        min={config.min}
        max={config.max}
        minLength={config.minLength}
        maxLength={config.maxLength}
        pattern={config.pattern}
      />
    </Field>
  );
}

function NewOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const preselectedServiceId = params.get("serviceId") ?? "";
  const [services, setServices] = useState<ServiceLine[] | null>(null);
  const [serviceId, setServiceId] = useState(preselectedServiceId);
  const [packageId, setPackageId] = useState("");
  const [title, setTitle] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [briefDescription, setBriefDescription] = useState("");
  const [budgetHint, setBudgetHint] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [formResponses, setFormResponses] = useState<Record<string, FormValue>>(
    {},
  );
  const [reviewing, setReviewing] = useState(false);
  const [ready, setReady] = useState(false);
  const [resumedDraft, setResumedDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<OrderFile[]>([]);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [submitting, setSubmitting] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const createKeyRef = useRef<string | null>(null);
  const submitKeyRef = useRef<string | null>(null);
  const saveInFlightRef = useRef<Promise<DraftResult> | null>(null);

  const selectedService = services?.find((service) => service.id === serviceId);
  const dynamicFields = useMemo(
    () => selectedService?.formFields ?? [],
    [selectedService],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const catalog = await apiFetch<ServiceLine[]>("/services", {
          auth: false,
        });
        const drafts = await apiFetch<OrderSummary[]>(
          "/customer/orders?status=draft&pageSize=1",
        );
        if (!active) return;
        setServices(catalog);
        if (drafts[0]) {
          const draft = await apiFetch<DraftDetail>(
            `/customer/orders/${drafts[0].id}`,
          );
          if (!active) return;
          const canResume =
            !preselectedServiceId ||
            draft.serviceLine.id === preselectedServiceId;
          if (canResume) {
            draftIdRef.current = draft.id;
            setDraftId(draft.id);
            versionRef.current = draft.version ?? 0;
            setServiceId(draft.serviceLine.id);
            setPackageId(draft.packageId ?? "");
            setTitle(draft.title ?? "");
            setUrgency(draft.urgency ?? "normal");
            setBriefDescription(draft.briefDescription ?? "");
            setBudgetHint(
              draft.budgetHint == null ? "" : String(draft.budgetHint),
            );
            setAcceptanceCriteria(
              draft.acceptanceCriteria
                ?.map((item) => item.description)
                .join("\n") ?? "",
            );
            setFormResponses(answersFromSnapshot(draft.formResponses));
            setUploadedFiles(draft.files ?? []);
            setSaveState("saved");
            setResumedDraft(true);
          }
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "بارگذاری فرم ممکن نشد.",
          );
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [preselectedServiceId]);

  function payload() {
    return {
      serviceId,
      packageId: packageId || null,
      title,
      urgency,
      briefDescription,
      formResponses,
      budgetHint: budgetHint ? Number(budgetHint) : null,
      acceptanceCriteria: acceptanceCriteria
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  async function persistDraft(): Promise<DraftResult> {
    while (saveInFlightRef.current) await saveInFlightRef.current;
    setSaveState("saving");
    const request = (async () => {
      if (!draftIdRef.current) {
        createKeyRef.current ??= crypto.randomUUID();
        const created = await apiFetch<DraftResult>("/customer/orders", {
          method: "POST",
          body: payload(),
          idempotencyKey: createKeyRef.current,
        });
        draftIdRef.current = created.id;
        setDraftId(created.id);
        versionRef.current = created.version;
        return created;
      }
      const updated = await apiFetch<DraftResult>(
        `/customer/orders/${draftIdRef.current}/draft`,
        {
          method: "PATCH",
          body: {
            ...payload(),
            serviceId: undefined,
            version: versionRef.current,
          },
        },
      );
      versionRef.current = updated.version;
      return updated;
    })();
    saveInFlightRef.current = request;
    try {
      const result = await request;
      setSaveState("saved");
      return result;
    } catch (cause) {
      setSaveState("error");
      throw cause;
    } finally {
      saveInFlightRef.current = null;
    }
  }

  useEffect(() => {
    if (!ready || !serviceId || reviewing) return;
    const timer = window.setTimeout(() => {
      persistDraft().catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "ذخیره پیش‌نویس ممکن نشد.",
        ),
      );
    }, 900);
    return () => window.clearTimeout(timer);
    // تمام داده‌های قابل ویرایش عمداً محرک Autosave هستند.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    serviceId,
    packageId,
    title,
    urgency,
    briefDescription,
    budgetHint,
    acceptanceCriteria,
    formResponses,
    reviewing,
  ]);

  function validateForReview() {
    if (!serviceId) return "نوع خدمت را انتخاب کنید.";
    if (title.trim().length < 3)
      return "عنوان درخواست باید حداقل ۳ کاراکتر باشد.";
    if (briefDescription.trim().length < 10)
      return "شرح نیاز باید حداقل ۱۰ کاراکتر باشد.";
    for (const field of dynamicFields) {
      const value = formResponses[field.fieldKey];
      const empty =
        value === undefined ||
        value === "" ||
        value === null ||
        (Array.isArray(value) && value.length === 0) ||
        (field.fieldType === "checkbox" && value !== true);
      if (field.required && empty) return `فیلد «${field.label}» الزامی است.`;
    }
    return "";
  }

  async function onReview(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForReview();
    if (validationError) return setError(validationError);
    setError("");
    try {
      await persistDraft();
      setReviewing(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "ذخیره پیش‌نویس ممکن نشد.",
      );
    }
  }

  async function submitOrder() {
    if (!draftIdRef.current) return;
    setSubmitting(true);
    setError("");
    try {
      submitKeyRef.current ??= crypto.randomUUID();
      await apiFetch(`/customer/orders/${draftIdRef.current}/submit`, {
        method: "POST",
        idempotencyKey: submitKeyRef.current,
      });
      router.push(`/orders/${draftIdRef.current}?submitted=1`);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "خطا در ثبت درخواست",
      );
      setSubmitting(false);
    }
  }

  if (!services && !ready) return <PageLoading />;
  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle subtitle="اطلاعات شما خودکار به‌عنوان پیش‌نویس ذخیره می‌شود">
        ثبت درخواست جدید
      </SectionTitle>
      {resumedDraft && !reviewing && (
        <p className="mb-4 rounded-control border border-info-border bg-info-subtle px-3 py-2 text-sm text-info">
          آخرین پیش‌نویس شما بازیابی شد؛ می‌توانید از همان‌جا ادامه دهید.
        </p>
      )}
      {reviewing ? (
        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-4 text-lg font-extrabold text-fg">
              مرور نهایی درخواست
            </h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fg-muted">خدمت</dt>
                <dd className="font-bold text-fg">{selectedService?.title}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">عنوان</dt>
                <dd className="font-bold text-fg">{title}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">فوریت</dt>
                <dd className="font-bold text-fg">{urgency}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">پکیج</dt>
                <dd className="font-bold text-fg">
                  {selectedService?.packages.find(
                    (item) => item.id === packageId,
                  )?.name ?? "بدون پکیج"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs text-fg-muted">شرح نیاز</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-fg">
                {briefDescription}
              </p>
            </div>
            {dynamicFields.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-bold text-fg">
                  پاسخ‌های تخصصی
                </h3>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {dynamicFields.map((field) => (
                    <div key={field.id}>
                      <dt className="text-xs text-fg-muted">{field.label}</dt>
                      <dd className="text-sm font-bold text-fg">
                        {Array.isArray(formResponses[field.fieldKey])
                          ? (formResponses[field.fieldKey] as string[]).join(
                              "، ",
                            )
                          : String(formResponses[field.fieldKey] ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Card>
          {error && <ErrorBanner message={error} />}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReviewing(false)}
              disabled={submitting}
            >
              بازگشت و ویرایش
            </Button>
            <Button
              type="button"
              onClick={submitOrder}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? "در حال ثبت نهایی..." : "تأیید و ارسال برای بررسی"}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onReview} className="flex flex-col gap-5">
          <Card>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="نوع خدمت">
                <select
                  className={inputClass}
                  value={serviceId}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    setPackageId("");
                    setFormResponses({});
                    setResumedDraft(false);
                    setDraftId(null);
                    setUploadedFiles([]);
                    draftIdRef.current = null;
                    versionRef.current = 0;
                    createKeyRef.current = null;
                  }}
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {services?.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="پکیج (اختیاری)">
                <select
                  className={inputClass}
                  value={packageId}
                  onChange={(event) => setPackageId(event.target.value)}
                  disabled={!selectedService?.packages.length}
                >
                  <option value="">بدون پکیج مشخص</option>
                  {selectedService?.packages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="عنوان درخواست">
                <input
                  className={inputClass}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="مثلاً: طراحی سایت فروشگاهی"
                  minLength={3}
                  required
                />
              </Field>
              <Field label="فوریت">
                <select
                  className={inputClass}
                  value={urgency}
                  onChange={(event) => setUrgency(event.target.value)}
                >
                  <option value="low">کم</option>
                  <option value="normal">عادی</option>
                  <option value="high">زیاد</option>
                  <option value="urgent">فوری</option>
                </select>
              </Field>
            </div>
            <div className="mt-4">
              <Field
                label="شرح نیاز"
                hint="هرچه دقیق‌تر بنویسید، بررسی سریع‌تر انجام می‌شود."
              >
                <textarea
                  className={`${inputClass} min-h-28`}
                  value={briefDescription}
                  onChange={(event) => setBriefDescription(event.target.value)}
                  minLength={10}
                  required
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field
                label="بودجه تقریبی (اختیاری)"
                hint="در صورت نبودن قیمت ثابت، پس از بررسی قیمت‌گذاری می‌شود."
              >
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={budgetHint}
                  onChange={(event) => setBudgetHint(event.target.value)}
                  dir="ltr"
                />
              </Field>
            </div>
          </Card>
          {selectedService && dynamicFields.length > 0 && (
            <Card>
              <h2 className="mb-1 text-base font-extrabold text-fg">
                جزئیات تخصصی خدمت
              </h2>
              <p className="mb-5 text-sm text-fg-muted">
                این فرم متناسب با خدمت انتخابی ساخته شده است.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {dynamicFields.map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={formResponses[field.fieldKey]}
                    onChange={(value) =>
                      setFormResponses((current) => ({
                        ...current,
                        [field.fieldKey]: value,
                      }))
                    }
                  />
                ))}
              </div>
            </Card>
          )}
          <Card>
            <h2 className="mb-1 text-base font-extrabold text-fg">
              فایل‌های ورودی
            </h2>
            <p className="mb-4 text-sm text-fg-muted">
              نمونه، بریف، داده یا هر فایل لازم برای اجرای سفارش را از مسیر امن
              اضافه کنید.
            </p>
            {draftId ? (
              <SecureFileUpload
                orderId={draftId}
                fileKind="input"
                label="آپلود فایل ورودی"
                onUploaded={(file) =>
                  setUploadedFiles((current) => [...current, file])
                }
              />
            ) : (
              <p className="text-sm text-fg-muted">
                پس از انتخاب خدمت و ذخیره خودکار پیش‌نویس، آپلود فعال می‌شود.
              </p>
            )}
            {uploadedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {uploadedFiles.map((file) => (
                  <SecureFileLink key={file.id} file={file} />
                ))}
              </div>
            )}
          </Card>
          <Card>
            <Field
              label="معیارهای پذیرش (اختیاری)"
              hint="هر معیار را در یک خط بنویسید؛ در صورت خالی‌بودن، معیارهای استاندارد خدمت استفاده می‌شوند."
            >
              <textarea
                className={`${inputClass} min-h-24`}
                value={acceptanceCriteria}
                onChange={(event) => setAcceptanceCriteria(event.target.value)}
              />
            </Field>
          </Card>
          {error && <ErrorBanner message={error} />}
          <div className="flex items-center justify-between gap-3">
            <p
              role="status"
              className={`text-xs ${saveState === "error" ? "text-danger" : "text-fg-muted"}`}
            >
              {saveState === "saving"
                ? "در حال ذخیره پیش‌نویس…"
                : saveState === "saved"
                  ? "پیش‌نویس ذخیره شد"
                  : saveState === "error"
                    ? "ذخیره خودکار ناموفق بود"
                    : "تغییرات به‌صورت خودکار ذخیره می‌شوند"}
            </p>
            <Button
              type="submit"
              disabled={!serviceId || saveState === "saving"}
            >
              مرور و ثبت نهایی
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrderForm />
    </Suspense>
  );
}
