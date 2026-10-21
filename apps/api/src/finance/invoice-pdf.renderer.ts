import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import createBidi from 'bidi-js';

const regular = readFileSync(join(__dirname, 'assets/Vazirmatn-Regular.ttf'));
const bold = readFileSync(join(__dirname, 'assets/Vazirmatn-Bold.ttf'));
const ink = '#102543';
const honey = '#EFC154';
const muted = '#546A87';
const bidi = createBidi();

// UAX #9 visual run ordering; each RTL run remains logical for font shaping.
// Do not reverse characters before shaping: that breaks joins and copy/search.
export function invoiceTextRuns(value: string) {
  const direction = /[\u0600-\u06ff]/u.test(value) ? 'rtl' : 'ltr';
  const { levels } = bidi.getEmbeddingLevels(value, direction);
  const runs: { text: string; level: number }[] = [];
  for (let start = 0; start < value.length;) {
    let end = start + 1;
    while (end < value.length && levels[end] === levels[start]) end += 1;
    runs.push({ text: value.slice(start, end), level: levels[start] });
    start = end;
  }
  const minimumOdd = Math.min(
    ...runs.filter((run) => run.level % 2).map((run) => run.level),
  );
  for (
    let level = Math.max(0, ...runs.map((run) => run.level));
    level >= minimumOdd;
    level -= 1
  ) {
    for (let start = 0; start < runs.length;) {
      if (runs[start].level < level) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < runs.length && runs[end].level >= level) end += 1;
      runs.splice(start, end - start, ...runs.slice(start, end).reverse());
      start = end;
    }
  }
  return runs.map((run) => run.text);
}

export interface InvoicePdfInput {
  invoiceNumber: string;
  orderCode: string;
  amount: number;
  issuedAt: Date;
}

function tehranDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return `${value('year')}/${value('month')}/${value('day')}  ${value('hour')}:${value('minute')}`;
}

/** Presentation only. Never reads a database or infers payment/tax/settlement. */
export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const amount = input.amount.toLocaleString('en-US');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    pdfVersion: '1.4',
    lang: 'fa-IR',
    info: {
      Title: 'فاکتور خدمات نیازت با ما',
      Author: 'Niazet Ba Ma',
      // Searchable, language-neutral identity/amount for existing consumers.
      Subject: `Invoice: ${input.invoiceNumber} | Order: ${input.orderCode} | Amount: ${amount} IRT | Issued: ${input.issuedAt.toISOString()}`,
    },
  });
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont('Vazirmatn', regular).registerFont('VazirmatnBold', bold);
  function text(
    value: string,
    x: number,
    y: number,
    width: number,
    size = 11,
    color = ink,
    strong = false,
    align: 'left' | 'right' = 'right',
  ) {
    doc
      .font(strong ? 'VazirmatnBold' : 'Vazirmatn')
      .fontSize(size)
      .fillColor(color);
    // Explicit features bypass word-cache layout and preserve complete joins.
    const options: PDFKit.Mixins.TextOptions = {
      lineBreak: false,
      features: ['rtla'],
    };
    const runs = invoiceTextRuns(value).flatMap((run) =>
      /^[\u0660-\u0669\u06f0-\u06f9.,٬٫\d]+$/u.test(run) ? [...run] : [run],
    );
    const runWidths = runs.map((run) => doc.widthOfString(run, options));
    let cursor =
      align === 'right'
        ? x + width - runWidths.reduce((sum, advance) => sum + advance, 0)
        : x;
    doc.markContent('Span', { actual: value });
    runs.forEach((run, index) => {
      doc.text(run, cursor, y, options);
      cursor += runWidths[index];
    });
    doc.endMarkedContent();
  }
  function field(label: string, value: string, y: number) {
    doc.roundedRect(48, y, 499, 66, 9).fill('#F2F5FA');
    text(label, 66, y + 9, 463, 9, muted);
    doc.font('Vazirmatn').fontSize(12);
    // Generated IDs are LTR and never ellipsized; fit unusually long values.
    const size = Math.min(
      12,
      (12 * 463) / Math.max(1, doc.widthOfString(value)),
    );
    text(value, 66, y + 30, 463, size, ink, false, 'left');
  }
  doc.rect(0, 0, 595.28, 152).fill(ink);
  doc.rect(0, 148, 595.28, 4).fill(honey);
  text('نیازت با ما', 315, 35, 232, 27, '#FFFFFF', true);
  text('خدمات تخصصی مدیریت‌شده', 300, 91, 247, 10, '#CBD9EC');
  text('فاکتور خدمات', 48, 47, 220, 19, honey, true, 'left');
  text('مشخصات فاکتور', 48, 180, 499, 15, ink, true);
  field('شماره فاکتور', input.invoiceNumber, 220);
  field('کد سفارش', input.orderCode, 296);
  field('تاریخ و ساعت صدور در تهران', tehranDate(input.issuedAt), 372);
  doc.roundedRect(48, 462, 499, 108, 12).fill(ink);
  text('مبلغ فاکتور', 330, 478, 195, 11, '#FFFFFF');
  text(amount, 70, 504, 350, 29, honey, true, 'left');
  text('تومان', 421, 516, 104, 13, honey, true);
  doc.rect(535, 603, 3, 19).fill(honey);
  text('راهنمای پیگیری', 60, 601, 462, 12, ink, true);
  text(
    'برای پیگیری، شماره فاکتور و کد سفارش را اعلام کنید.',
    60,
    640,
    475,
    10,
    muted,
  );
  text(
    'مبلغ این سند مطابق مبلغ ثبت‌شده فاکتور در سامانه است.',
    60,
    665,
    475,
    10,
    muted,
  );
  text(
    'صدور این فایل به‌تنهایی وضعیت پرداخت یا تسویه را تغییر نمی‌دهد.',
    60,
    690,
    475,
    10,
    muted,
  );
  doc
    .moveTo(48, 755)
    .lineTo(547, 755)
    .strokeColor('#D6E0EE')
    .lineWidth(0.7)
    .stroke();
  text('نیازت با ما، همراه انجام کارهای مهم', 48, 773, 499, 9, muted);
  doc.end();
  return result;
}
