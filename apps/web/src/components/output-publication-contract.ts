export type OutputAvailability = 'released' | 'awaiting_qc' | 'manual_review_required' | 'unavailable';
export type CustomerPublication = { id: string; availability: OutputAvailability; approvedAt: string | null };
export type LegacyOutput = { id: string; orderId: string; originalName: string; fileKind: 'output' | 'revision'; checksum: string | null; createdAt: string };
export type LegacyInspection = {
  file: LegacyOutput & { sizeBytes: number; mimeType: string };
  orderCode: string; orderTitle: string; reviewId: string | null;
  items: { id: string; label: string }[];
};
export function outputKindLabel(kind: string): string {
  switch (kind) {
    case 'output': return 'خروجی';
    case 'revision': return 'اصلاحیه';
    case 'input': return 'ورودی';
    case 'invoice': return 'فاکتور';
    case 'report': return 'گزارش';
    case 'message_attachment': return 'پیوست پیام';
    case 'ticket_attachment': return 'پیوست تیکت';
    default: return 'فایل';
  }
}
function invalid(): never { throw new Error('اطلاعات نسخهٔ خروجی معتبر نیست؛ وضعیت را بازخوانی کنید.'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if (!Object.hasOwn(descriptor, 'value')) return invalid();
  return value as Record<string, unknown>;
}
export function outputId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return invalid();
  return value;
}
function text(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return invalid();
  return value;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid();
  return value;
}
function checksum(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return invalid();
  return value;
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map(item => item.id)).size !== items.length) return invalid();
  return items;
}
export function readCustomerPublications(value: unknown): CustomerPublication[] {
  const raw = record(value);
  if (!Array.isArray(raw.files) || raw.files.length > 10000) return invalid();
  return unique(raw.files.map(value => {
    const file = record(value);
    if (!['released', 'awaiting_qc', 'manual_review_required', 'unavailable'].includes(String(file.availability))) return invalid();
    const released = file.availability === 'released';
    if (!released && file.approvedAt !== null) return invalid();
    return { id: outputId(file.id), availability: file.availability as OutputAvailability, approvedAt: released ? date(file.approvedAt) : null };
  }));
}
export function readLegacyQueue(value: unknown) {
  const raw = record(value);
  if (raw.automaticApproval !== false || !Array.isArray(raw.files) || raw.files.length > 100) return invalid();
  return { files: unique(raw.files.map(value => {
    const file = record(value);
    if (file.fileKind !== 'output' && file.fileKind !== 'revision') return invalid();
    return { id: outputId(file.id), orderId: outputId(file.orderId), originalName: text(file.originalName), fileKind: file.fileKind, checksum: checksum(file.checksum), createdAt: date(file.createdAt) } as LegacyOutput;
  })), nextCursor: raw.nextCursor === null ? null : outputId(raw.nextCursor) };
}
export function readLegacyInspection(orderValue: unknown, serviceValue: unknown, selected: LegacyOutput): LegacyInspection {
  const order = record(orderValue), service = record(serviceValue);
  if (order.id !== selected.orderId || order.serviceId !== service.id || !Array.isArray(order.files) || !Array.isArray(order.qcReviews) || !Array.isArray(service.qcChecklistTemplates)) return invalid();
  const matches = order.files.map(record).filter(f => f.id === selected.id);
  if (matches.length !== 1) return invalid();
  const file = matches[0];
  if (file.orderId !== selected.orderId || file.fileKind !== selected.fileKind || file.scanStatus !== 'clean' || file.purgedAt !== null || checksum(file.checksum) !== selected.checksum || typeof file.sizeBytes !== 'number' || !Number.isInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > 25 * 1024 * 1024) return invalid();
  const pending = order.qcReviews.map(record).filter(r => r.result === null);
  if (order.status === 'qc_in_review' ? pending.length !== 1 : pending.length > 0) return invalid();
  const items = unique(service.qcChecklistTemplates.flatMap(value => {
    const template = record(value); if (!Array.isArray(template.items)) return invalid();
    return template.items.map(value => { const item = record(value); return { id: outputId(item.id), label: text(item.label) }; });
  }));
  if (items.length > 200) return invalid();
  return { file: { ...selected, originalName: text(file.originalName), sizeBytes: file.sizeBytes, mimeType: text(file.mimeType, 128) }, orderCode: text(order.code, 128), orderTitle: text(order.title), reviewId: order.status === 'qc_in_review' ? outputId(pending[0].id) : null, items };
}
export function publicationDownloadPath(value: unknown): string {
  const raw = record(value); if (typeof raw.url !== 'string') return invalid();
  const url = new URL(raw.url, 'http://local.invalid');
  const tokens = url.searchParams.getAll('token');
  if (tokens.length !== 1 || !tokens[0] || tokens[0].length > 8192 || /[\u0000-\u0020]/.test(tokens[0])) return invalid();
  // Never fetch the supplied origin/path. Only the encoded token enters our proxy.
  return '/api/backend/files/download?token=' + encodeURIComponent(tokens[0]);
}
export async function readPublicationBytes(response: Response, expectedBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || !Number.isInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > 25 * 1024 * 1024) return invalid();
  if (!response.body) { if (expectedBytes === 0) return new Uint8Array(0); return invalid(); }
  const result = new Uint8Array(expectedBytes), reader = response.body.getReader();
  let size = 0, done = false;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) { done = true; break; } if (size + chunk.value.length > expectedBytes) return invalid(); result.set(chunk.value, size); size += chunk.value.length; }
    if (size !== expectedBytes) return invalid();
    return result;
  } finally { if (!done) await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
