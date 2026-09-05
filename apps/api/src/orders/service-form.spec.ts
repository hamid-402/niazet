import { BadRequestException } from '@nestjs/common';
import { answersFromSnapshot, snapshotServiceForm } from './service-form';

const service = { id: 'service-1', slug: 'website', title: 'طراحی سایت' };
const fields = [
  {
    id: 'field-1',
    fieldKey: 'goal',
    label: 'هدف سایت',
    fieldType: 'text',
    required: true,
    options: { minLength: 3, maxLength: 50 },
  },
  {
    id: 'field-2',
    fieldKey: 'platform',
    label: 'پلتفرم',
    fieldType: 'select',
    required: true,
    options: ['wordpress', { value: 'custom', label: 'اختصاصی' }],
  },
  {
    id: 'field-3',
    fieldKey: 'pages',
    label: 'تعداد صفحات',
    fieldType: 'number',
    required: false,
    options: { min: 1, max: 100 },
  },
] as const;

describe('service form snapshot', () => {
  it('normalizes and snapshots answers with the submitted schema', () => {
    const snapshot = snapshotServiceForm(
      service,
      fields as never,
      { goal: '  فروش آنلاین  ', platform: 'custom', pages: '12' },
      true,
    );
    expect(answersFromSnapshot(snapshot as never)).toEqual({
      goal: 'فروش آنلاین',
      platform: 'custom',
      pages: 12,
    });
    expect(snapshot).toMatchObject({
      version: 1,
      service,
    });
    expect((snapshot as { fields: unknown[] }).fields[0]).toMatchObject({
      key: 'goal',
      label: 'هدف سایت',
    });
  });

  it('allows an incomplete draft but rejects it at final submission', () => {
    expect(() =>
      snapshotServiceForm(service, fields as never, {}, false),
    ).not.toThrow();
    expect(() =>
      snapshotServiceForm(service, fields as never, {}, true),
    ).toThrow(BadRequestException);
  });

  it('rejects unknown fields and values outside configured choices', () => {
    expect(() =>
      snapshotServiceForm(service, fields as never, { unknown: 'x' }, false),
    ).toThrow('پاسخ ناشناخته');
    expect(() =>
      snapshotServiceForm(
        service,
        fields as never,
        { goal: 'فروش', platform: 'invalid' },
        true,
      ),
    ).toThrow('گزینه نامعتبر');
  });
});
