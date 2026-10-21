'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { RequireRole } from '@/components/require-role';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { Badge, Button, Card, ErrorBanner, Field, inputClass, LinkButton, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';

const steps = [
  ['registered', 'تشکیل پرونده'], ['identity_verification', 'بررسی هویت'], ['skills_exam', 'آزمون مهارت'],
  ['interview', 'مصاحبه'], ['reference_check', 'استعلام سوابق'], ['contract', 'قرارداد'], ['nda', 'تعهد محرمانگی'],
  ['trial_period', 'دوره آزمایشی'], ['limited_access', 'بررسی دسترسی محدود'], ['initial_evaluation', 'ارزیابی نهایی'], ['approved', 'تأیید همکاری'],
];
const label = (stage: string) => steps.find(row => row[0] === stage)?.[1] ?? 'رد همکاری';
type Decision = 'approve_step' | 'reject' | 'reopen';
type Dossier = { id: string; displayAlias: string; onboarding: null | { stage: string; version: number; reviews: Array<{ id: string; stage: string; decision: Decision; note: string; evidenceReference: string | null; createdAt: string; actor: { fullName: string } }> } };
const decisionLabel: Record<Decision, string> = { approve_step: 'تأیید مرحله', reject: 'رد همکاری', reopen: 'بازگشایی پرونده' };

export default function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireRole roles={['admin']} adminScopes={['ops_admin']}><DossierPanel id={id} /></RequireRole>;
}
function DossierPanel({ id }: { id: string }) {
  const [profile, setProfile] = useState<Dossier | null>(null);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const url = `/admin/staff/${id}/onboarding`;
  const load = useCallback(async (signal?: AbortSignal) => {
    setProfile(await apiFetch<Dossier>(url, { signal, dedupe: false }));
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Dossier>(url, { signal: controller.signal, dedupe: false }).then(setProfile).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'پرونده دریافت نشد.'); });
    return () => controller.abort();
  }, [url]);
  async function start() {
    setBusy(true); setError('');
    try { await apiFetch(`${url}/start`, { method: 'POST' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تشکیل پرونده انجام نشد.'); }
    finally { setBusy(false); }
  }
  async function review(note: string) {
    setError('');
    if (note.trim().length < 10) { setError('یادداشت بررسی باید حداقل ۱۰ نویسه باشد.'); setDecision(null); return; }
    try {
      await apiFetch(`${url}/review`, { method: 'POST', body: { version: profile?.onboarding?.version, decision, note, ...(evidence ? { evidenceReference: evidence } : {}) } });
      setEvidence(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'تصمیم ثبت نشد.'); await load().catch(() => undefined); }
    finally { setDecision(null); }
  }
  const dossier = profile?.onboarding;
  const index = steps.findIndex(row => row[0] === dossier?.stage);
  return <div className="space-y-5">
    <SectionTitle subtitle="هر مرحله با بررسی انسانی، شناسه مدرک و سابقه تصمیم ثبت می‌شود.">پرونده جذب {profile?.displayAlias ?? 'مجری بیرونی'}</SectionTitle>
    <LinkButton href={`/admin/staff/${id}`} variant="secondary">بازگشت به پروفایل مجری</LinkButton>
    {error && <ErrorBanner message={error} />}
    {!profile && !error && <PageLoading />}
    {profile && !dossier && <Card><p className="mb-4 leading-8">این مجری هنوز پرونده مرحله‌ای ندارد. سفارش‌های فعال باید پیش از تشکیل پرونده تعیین تکلیف شوند.</p><Button disabled={busy} onClick={() => void start()}>تشکیل پرونده</Button></Card>}
    {dossier && <>
      <Card><div className="mb-5 flex flex-wrap justify-between gap-3"><h2 className="font-bold">مسیر گزینش</h2><Badge color={dossier.stage === 'approved' ? 'green' : 'yellow'}>{label(dossier.stage)}</Badge></div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{steps.map(([stage, title], i) => <li key={stage} aria-current={stage === dossier.stage ? 'step' : undefined} className={`rounded-control border p-4 text-sm ${stage === dossier.stage ? 'border-accent bg-accent-subtle text-fg' : 'border-border bg-bg-subtle text-fg-muted'}`}><span className="me-2">{formatNumber(i + 1)}.</span>{title}{i < index && <span className="ms-2">✓</span>}</li>)}</ol>
        <p className="mt-5 text-sm leading-8 text-fg-muted">در دوره آزمایشی فقط نمونه غیرواقعی و بدون اطلاعات مشتری بررسی شود. تا تکمیل همه مراحل، تخصیص سفارش واقعی مجاز نیست. این فرم جایگزین استعلام هویت یا بررسی حقوقی قرارداد نیست.</p>
      </Card>
      <Card><h2 className="mb-4 font-bold">ثبت بررسی مرحله فعلی</h2>
        <Field label="شناسه مدرک در مخزن خصوصی"><input dir="ltr" className={inputClass} value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={120} placeholder="DOC-2026-001" aria-describedby="evidence-help" /></Field>
        <p id="evidence-help" className="my-3 text-xs leading-7 text-fg-muted">فقط شناسه قابل ارجاع وارد شود، نه متن قرارداد، کد ملی، رمز یا لینک عمومی. حروف انگلیسی، عدد، خط تیره، خط زیر و / مجازند.</p>
        <div className="flex flex-wrap gap-3">
          {!['approved', 'rejected'].includes(dossier.stage) && <Button disabled={dossier.stage !== 'registered' && !/^[a-zA-Z0-9_\-/]{3,120}$/.test(evidence)} onClick={() => setDecision('approve_step')}>{dossier.stage === 'registered' ? 'شروع بررسی هویت' : 'تأیید این مرحله و ادامه'}</Button>}
          {dossier.stage !== 'rejected' && <Button variant="danger" onClick={() => setDecision('reject')}>رد یا لغو تأیید همکاری</Button>}
          {dossier.stage === 'rejected' && <Button variant="secondary" onClick={() => setDecision('reopen')}>بازگشایی با بررسی مجدد</Button>}
        </div>
      </Card>
      <Card><h2 className="mb-5 font-bold">سابقه تصمیم‌ها</h2>{!dossier.reviews.length ? <p className="text-sm text-fg-muted">هنوز تصمیمی ثبت نشده است.</p> : <ol className="space-y-4">{dossier.reviews.map(row => <li key={row.id} className="border-b border-border pb-4 last:border-0"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{label(row.stage)} · {decisionLabel[row.decision]}</strong><span className="text-fg-muted">{formatDate(row.createdAt)}</span></div><p className="my-3 whitespace-pre-wrap break-words text-sm leading-7">{row.note}</p><p className="text-xs text-fg-muted">بررسی‌کننده: {row.actor.fullName}{row.evidenceReference && <> · مدرک: <bdi>{row.evidenceReference}</bdi></>}</p></li>)}</ol>}<p className="mt-4 text-xs text-fg-muted">حداکثر ۱۰۰ تصمیم اخیر نمایش داده می‌شود؛ سابقه قدیمی حذف نمی‌شود.</p></Card>
    </>}
    <ConfirmationModal open={decision !== null} title={decision ? decisionLabel[decision] : ''} description={`مرحله فعلی: ${label(dossier?.stage ?? 'registered')}. نتیجه بررسی خود را با حداقل ۱۰ نویسه ثبت کنید.`} impacts={['این تصمیم در سابقه غیرقابل ویرایش ثبت می‌شود.', 'تأیید نهایی امکان بررسی تخصیص سفارش را باز می‌کند؛ تخصیص خودکار انجام نمی‌شود.']} confirmLabel="ثبت تصمیم انسانی" tone={decision === 'reject' ? 'danger' : 'primary'} onCancel={() => setDecision(null)} onConfirm={review} />
  </div>;
}
