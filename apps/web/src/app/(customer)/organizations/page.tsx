'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Button, Card, ErrorBanner, Field, inputClass, LinkButton, PageLoading, SectionTitle } from '@/components/ui';
type Membership = { id: string; role: string; status: string; organization: { id: string; name: string } };
const roleLabel: Record<string,string> = { owner: 'مالک', manager: 'مدیر تیم‌ها', member: 'عضو' };
export default function OrganizationsPage() {
 const router = useRouter();
 const [rows, setRows] = useState<Membership[] | null>(null);
 const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 useEffect(() => { const c = new AbortController(); apiFetch<Membership[]>('/customer/organizations', { signal: c.signal }).then(setRows).catch(e => { if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'فهرست دریافت نشد.'); }); return () => c.abort(); }, []);
 async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const org = await apiFetch<{ id: string }>('/customer/organizations', { method: 'POST', body: { name: name.trim() } }); router.push(`/organizations/${org.id}`); } catch(e) { setError(e instanceof Error ? e.message : 'سازمان ایجاد نشد.'); } finally { setBusy(false); } }
 async function respond(id: string, accept: boolean) { setBusy(true); setError(''); try { await apiFetch(`/customer/organizations/invitations/${id}/respond`, { method: 'POST', body: { accept } }); setRows(await apiFetch<Membership[]>('/customer/organizations', { dedupe: false })); } catch(e) { setError(e instanceof Error ? e.message : 'دعوت تعیین تکلیف نشد.'); } finally { setBusy(false); } }
 return <div className="space-y-5"><SectionTitle subtitle="تیم‌ها، دعوت‌ها و سفارش‌های کاری؛ جدا از اطلاعات مالی شخصی شما">سازمان‌های من</SectionTitle>{error && <ErrorBanner message={error} />}
 <Card><h2 className="mb-4 font-bold">ایجاد فضای سازمانی</h2><form onSubmit={create} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"><Field label="نام سازمان"><input required minLength={2} maxLength={100} className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field><Button disabled={busy || name.trim().length < 2}>ایجاد سازمان</Button></form><p className="mt-3 text-xs leading-7 text-fg-muted">ایجاد سازمان هزینه‌ای از کیف پول کم نمی‌کند. قابلیت دعوت و اتصال سفارش پس از تأیید اشتراک توسط واحد مالی فعال می‌شود.</p></Card>
 {!rows && !error && <PageLoading />}{rows?.length === 0 && <Card><p className="text-fg-muted">هنوز عضو سازمانی نیستید و دعوتی ندارید.</p></Card>}
 <div className="grid gap-4 lg:grid-cols-2">{rows?.map(row => <Card key={row.id}><h2 className="text-lg font-bold">{row.organization.name}</h2><p className="my-3 text-sm text-fg-muted">نقش شما: {roleLabel[row.role] ?? row.role} · {row.status === 'invited' ? 'منتظر پذیرش شما' : 'عضویت فعال'}</p>{row.status === 'invited' ? <><p className="mb-4 text-sm leading-7">با پذیرش، نام شما برای اعضای مجاز سازمان قابل مشاهده می‌شود. سفارش شخصی فقط با اقدام خودتان به سازمان متصل خواهد شد.</p><div className="flex gap-3"><Button disabled={busy} onClick={() => void respond(row.id, true)}>پذیرش دعوت</Button><Button variant="secondary" disabled={busy} onClick={() => void respond(row.id, false)}>رد دعوت</Button></div></> : <LinkButton href={`/organizations/${row.organization.id}`} variant="secondary">ورود به سازمان</LinkButton>}</Card>)}</div>
 </div>;
}
