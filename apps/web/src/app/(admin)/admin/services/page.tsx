"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, Card, ErrorBanner, inputClass, PageLoading, SectionTitle } from "@/components/ui";

type FormField = { id: string; label: string; fieldKey: string; fieldType: string; required: boolean };
type QcTemplate = { id: string; name: string; items: { id: string; label: string }[] };
type Service = {
  id: string; slug: string; title: string; category: string; description: string;
  pricingModel: string; basePrice: number | null; isActive: boolean;
  packages: { id: string; name: string; price: number | null; isActive: boolean }[];
  formFields: FormField[];
  acceptanceCriteria?: { id: string; description: string }[];
  qcChecklistTemplates: QcTemplate[];
};

const initialService = { slug: "", title: "", category: "", description: "", pricingModel: "manual_quote", basePrice: "" };

export default function AdminServicesPage() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [serviceForm, setServiceForm] = useState(initialService);
  const [packageForm, setPackageForm] = useState({ name: "", price: "" });
  const [fieldForm, setFieldForm] = useState({ label: "", fieldKey: "", fieldType: "text", options: "", required: false });
  const [criterion, setCriterion] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [qcItem, setQcItem] = useState({ templateId: "", label: "" });

  const load = useCallback(async () => {
    const result = await apiFetch<Service[]>("/admin/services");
    setServices(result);
    setSelectedId((current) => current || result[0]?.id || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Service[]>("/admin/services")
      .then((result) => {
        if (cancelled) return;
        setServices(result);
        setSelectedId(result[0]?.id || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, []);

  async function run(action: () => Promise<unknown>, reset?: () => void) {
    setError(""); setBusy(true);
    try { await action(); reset?.(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "خطا در ذخیره تغییرات"); }
    finally { setBusy(false); }
  }

  if (!services) return error ? <ErrorBanner message={error} /> : <PageLoading />;
  const selected = services.find((service) => service.id === selectedId) ?? null;

  return <div className="space-y-4">
    <SectionTitle>مدیریت خدمات، بسته‌ها و فرم‌ها</SectionTitle>
    {error && <ErrorBanner message={error} />}

    <Card>
      <h2 className="mb-3 font-bold text-fg">تعریف خدمت جدید</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <input className={inputClass} placeholder="عنوان خدمت" value={serviceForm.title} onChange={(event) => setServiceForm({ ...serviceForm, title: event.target.value })} />
        <input className={inputClass} dir="ltr" placeholder="slug-example" value={serviceForm.slug} onChange={(event) => setServiceForm({ ...serviceForm, slug: event.target.value })} />
        <input className={inputClass} placeholder="دسته‌بندی" value={serviceForm.category} onChange={(event) => setServiceForm({ ...serviceForm, category: event.target.value })} />
        <select className={inputClass} value={serviceForm.pricingModel} onChange={(event) => setServiceForm({ ...serviceForm, pricingModel: event.target.value })}><option value="manual_quote">قیمت‌گذاری دستی</option><option value="fixed">قیمت ثابت</option><option value="formula">فرمول</option></select>
        <input className={inputClass} type="number" placeholder="قیمت پایه (تومان)" value={serviceForm.basePrice} onChange={(event) => setServiceForm({ ...serviceForm, basePrice: event.target.value })} />
        <textarea className={`${inputClass} md:col-span-2 xl:col-span-3`} placeholder="شرح خدمت" value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} />
      </div>
      <Button className="mt-3" disabled={busy || !serviceForm.slug || !serviceForm.title || !serviceForm.category || !serviceForm.description} onClick={() => run(() => apiFetch("/admin/services", { method: "POST", body: { ...serviceForm, basePrice: serviceForm.basePrice ? Number(serviceForm.basePrice) : undefined } }), () => setServiceForm(initialService))}>ایجاد خدمت</Button>
    </Card>

    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <Card>
        <h2 className="mb-3 font-bold text-fg">فهرست خدمات</h2>
        <div className="space-y-2">{services.map((service) => <button key={service.id} className={`w-full rounded-card border p-3 text-right ${selectedId === service.id ? "border-success-border bg-success-subtle" : "border-border"}`} onClick={() => setSelectedId(service.id)}><span className="font-medium text-fg">{service.title}</span><span className={`mr-2 text-xs ${service.isActive ? "text-success" : "text-fg-subtle"}`}>{service.isActive ? "فعال" : "غیرفعال"}</span><p className="mt-1 text-xs text-fg-subtle" dir="ltr">{service.slug}</p></button>)}</div>
      </Card>

      {selected && <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-fg">{selected.title}</h2><p className="text-sm text-fg-muted">{selected.description}</p></div><Button variant="secondary" disabled={busy} onClick={() => run(() => apiFetch(`/admin/services/${selected.id}/active`, { method: "PATCH", body: { isActive: !selected.isActive } }))}>{selected.isActive ? "غیرفعال‌کردن" : "فعال‌کردن"}</Button></div>
        </Card>

        <Card>
          <h3 className="mb-3 font-bold text-fg">بسته‌های خدمت</h3>
          <div className="mb-3 flex flex-wrap gap-2">{selected.packages.map((item) => <span key={item.id} className="rounded-control bg-bg-subtle px-3 py-2 text-sm">{item.name}{item.price != null ? ` · ${item.price.toLocaleString("fa-IR")} تومان` : ""}</span>)}</div>
          <div className="grid gap-2 sm:grid-cols-2"><input className={inputClass} placeholder="نام بسته" value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} /><input className={inputClass} type="number" placeholder="قیمت" value={packageForm.price} onChange={(event) => setPackageForm({ ...packageForm, price: event.target.value })} /></div>
          <Button className="mt-2" variant="secondary" disabled={busy || !packageForm.name} onClick={() => run(() => apiFetch(`/admin/services/${selected.id}/packages`, { method: "POST", body: { name: packageForm.name, price: packageForm.price ? Number(packageForm.price) : undefined } }), () => setPackageForm({ name: "", price: "" }))}>افزودن بسته</Button>
        </Card>

        <Card>
          <h3 className="mb-3 font-bold text-fg">فیلدهای فرم سفارش</h3>
          <div className="mb-3 flex flex-wrap gap-2">{selected.formFields.map((field) => <span key={field.id} className="rounded-control bg-info-subtle px-3 py-2 text-sm text-info">{field.label} · {field.fieldType}{field.required ? " · اجباری" : ""}</span>)}</div>
          <div className="grid gap-2 md:grid-cols-2"><input className={inputClass} placeholder="عنوان فیلد" value={fieldForm.label} onChange={(event) => setFieldForm({ ...fieldForm, label: event.target.value })} /><input className={inputClass} dir="ltr" placeholder="field_key" value={fieldForm.fieldKey} onChange={(event) => setFieldForm({ ...fieldForm, fieldKey: event.target.value })} /><select className={inputClass} value={fieldForm.fieldType} onChange={(event) => setFieldForm({ ...fieldForm, fieldType: event.target.value })}>{["text","textarea","number","select","radio","checkbox","multiselect","date","email","url"].map((type) => <option key={type} value={type}>{type}</option>)}</select><input className={inputClass} placeholder="گزینه‌ها با ویرگول" value={fieldForm.options} onChange={(event) => setFieldForm({ ...fieldForm, options: event.target.value })} /><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={fieldForm.required} onChange={(event) => setFieldForm({ ...fieldForm, required: event.target.checked })} />فیلد اجباری</label></div>
          <Button className="mt-2" variant="secondary" disabled={busy || !fieldForm.label || !fieldForm.fieldKey} onClick={() => run(() => apiFetch(`/admin/services/${selected.id}/form-fields`, { method: "POST", body: { ...fieldForm, options: fieldForm.options.split(",").map((item) => item.trim()).filter(Boolean) } }), () => setFieldForm({ label: "", fieldKey: "", fieldType: "text", options: "", required: false }))}>افزودن فیلد</Button>
        </Card>

        <Card>
          <h3 className="mb-3 font-bold text-fg">معیارهای پذیرش</h3>
          <ul className="mb-3 list-inside list-disc text-sm text-fg-muted">{selected.acceptanceCriteria?.map((item) => <li key={item.id}>{item.description}</li>)}</ul>
          <div className="flex gap-2"><input className={inputClass} placeholder="معیار تحویل قابل سنجش" value={criterion} onChange={(event) => setCriterion(event.target.value)} /><Button variant="secondary" disabled={busy || criterion.trim().length < 3} onClick={() => run(() => apiFetch(`/admin/services/${selected.id}/acceptance-criteria`, { method: "POST", body: { description: criterion.trim() } }), () => setCriterion(""))}>افزودن</Button></div>
        </Card>

        <Card>
          <h3 className="mb-3 font-bold text-fg">قالب و چک‌لیست QC</h3>
          <div className="mb-3 space-y-2">{selected.qcChecklistTemplates.map((template) => <div key={template.id} className="rounded-card border border-border p-3"><p className="font-medium text-fg">{template.name}</p><p className="mt-1 text-xs text-fg-muted">{template.items.map((item) => item.label).join(" · ") || "بدون آیتم"}</p></div>)}</div>
          <div className="flex gap-2"><input className={inputClass} placeholder="نام قالب QC" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /><Button variant="secondary" disabled={busy || templateName.trim().length < 2} onClick={() => run(() => apiFetch(`/admin/services/${selected.id}/qc-templates`, { method: "POST", body: { name: templateName.trim() } }), () => setTemplateName(""))}>ساخت قالب</Button></div>
          {selected.qcChecklistTemplates.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr_auto]"><select className={inputClass} value={qcItem.templateId} onChange={(event) => setQcItem({ ...qcItem, templateId: event.target.value })}><option value="">انتخاب قالب</option>{selected.qcChecklistTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><input className={inputClass} placeholder="آیتم کنترل کیفیت" value={qcItem.label} onChange={(event) => setQcItem({ ...qcItem, label: event.target.value })} /><Button variant="secondary" disabled={busy || !qcItem.templateId || qcItem.label.trim().length < 2} onClick={() => run(() => apiFetch(`/admin/services/${selected.id}/qc-templates/${qcItem.templateId}/items`, { method: "POST", body: { label: qcItem.label.trim() } }), () => setQcItem({ templateId: "", label: "" }))}>افزودن آیتم</Button></div>}
        </Card>
      </div>}
    </div>
  </div>;
}
