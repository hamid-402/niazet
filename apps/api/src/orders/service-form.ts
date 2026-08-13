import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const SERVICE_FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'multiselect',
  'date',
  'email',
  'url',
] as const;

export interface ServiceFormFieldDefinition {
  id: string;
  label: string;
  fieldKey: string;
  fieldType: string;
  required: boolean;
  options: Prisma.JsonValue | null;
}

type ValidationConfig = {
  choices: { value: string; label: string }[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function numericOption(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function parseFieldOptions(
  value: Prisma.JsonValue | null,
): ValidationConfig {
  const record = asRecord(value);
  const rawChoices = Array.isArray(value)
    ? value
    : Array.isArray(record.choices)
      ? record.choices
      : Array.isArray(record.options)
        ? record.options
        : [];
  const choices = rawChoices.flatMap((choice) => {
    if (typeof choice === 'string' || typeof choice === 'number') {
      return [{ value: String(choice), label: String(choice) }];
    }
    if (choice && typeof choice === 'object' && !Array.isArray(choice)) {
      const item = choice as Record<string, unknown>;
      if (typeof item.value === 'string') {
        return [
          {
            value: item.value,
            label: typeof item.label === 'string' ? item.label : item.value,
          },
        ];
      }
    }
    return [];
  });
  return {
    choices,
    min: numericOption(record.min),
    max: numericOption(record.max),
    minLength: numericOption(record.minLength),
    maxLength: numericOption(record.maxLength),
    pattern: typeof record.pattern === 'string' ? record.pattern : undefined,
  };
}

function isEmpty(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function invalid(label: string, detail: string): never {
  throw new BadRequestException(`فیلد «${label}» ${detail}`);
}

function normalizeAnswer(
  field: ServiceFormFieldDefinition,
  value: unknown,
  requireAll: boolean,
): unknown {
  if (isEmpty(value)) {
    if (requireAll && field.required) invalid(field.label, 'الزامی است.');
    return undefined;
  }
  if (
    !SERVICE_FORM_FIELD_TYPES.includes(
      field.fieldType as (typeof SERVICE_FORM_FIELD_TYPES)[number],
    )
  ) {
    invalid(field.label, 'نوع پشتیبانی‌نشده دارد.');
  }
  const config = parseFieldOptions(field.options);
  if (field.fieldType === 'checkbox') {
    if (typeof value !== 'boolean')
      invalid(field.label, 'باید بله یا خیر باشد.');
    if (requireAll && field.required && !value)
      invalid(field.label, 'باید تأیید شود.');
    return value;
  }
  if (field.fieldType === 'multiselect') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
      invalid(field.label, 'انتخاب‌های نامعتبر دارد.');
    const selected = value as string[];
    const allowed = new Set(config.choices.map((item) => item.value));
    if (allowed.size && selected.some((item) => !allowed.has(item)))
      invalid(field.label, 'شامل گزینه نامعتبر است.');
    return [...new Set(selected)];
  }
  if (field.fieldType === 'number') {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numberValue))
      invalid(field.label, 'باید عدد معتبر باشد.');
    if (config.min !== undefined && numberValue < config.min)
      invalid(field.label, `نباید کمتر از ${config.min} باشد.`);
    if (config.max !== undefined && numberValue > config.max)
      invalid(field.label, `نباید بیشتر از ${config.max} باشد.`);
    return numberValue;
  }
  if (typeof value !== 'string')
    invalid(field.label, 'مقدار متنی معتبر ندارد.');
  const text = value.trim();
  if (config.minLength !== undefined && text.length < config.minLength)
    invalid(field.label, `باید حداقل ${config.minLength} کاراکتر باشد.`);
  if (config.maxLength !== undefined && text.length > config.maxLength)
    invalid(field.label, `نباید بیشتر از ${config.maxLength} کاراکتر باشد.`);
  if (config.pattern) {
    try {
      if (!new RegExp(config.pattern).test(text))
        invalid(field.label, 'با الگوی مورد انتظار مطابقت ندارد.');
    } catch {
      invalid(field.label, 'تنظیم Validation معتبری ندارد.');
    }
  }
  if (field.fieldType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
    invalid(field.label, 'ایمیل معتبر نیست.');
  if (field.fieldType === 'url') {
    try {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol))
        invalid(field.label, 'باید نشانی http یا https باشد.');
    } catch {
      invalid(field.label, 'نشانی وب معتبر نیست.');
    }
  }
  if (field.fieldType === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const parsed = match ? new Date(`${text}T00:00:00.000Z`) : null;
    if (
      !match ||
      !parsed ||
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== Number(match[1]) ||
      parsed.getUTCMonth() + 1 !== Number(match[2]) ||
      parsed.getUTCDate() !== Number(match[3])
    )
      invalid(field.label, 'تاریخ معتبر نیست.');
  }
  if (
    ['select', 'radio'].includes(field.fieldType) &&
    config.choices.length &&
    !config.choices.some((item) => item.value === text)
  )
    invalid(field.label, 'گزینه نامعتبر دارد.');
  return text;
}

export function snapshotServiceForm(
  service: { id: string; slug: string; title: string },
  fields: ServiceFormFieldDefinition[],
  responses: Record<string, unknown> = {},
  requireAll = false,
): Prisma.InputJsonValue {
  const knownKeys = new Set(fields.map((field) => field.fieldKey));
  const unknownKey = Object.keys(responses).find((key) => !knownKeys.has(key));
  if (unknownKey)
    throw new BadRequestException(
      `پاسخ ناشناخته «${unknownKey}» ارسال شده است.`,
    );
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    service: { id: service.id, slug: service.slug, title: service.title },
    fields: fields.map((field) => ({
      id: field.id,
      key: field.fieldKey,
      label: field.label,
      type: field.fieldType,
      required: field.required,
      options: field.options ?? null,
      answer:
        normalizeAnswer(field, responses[field.fieldKey], requireAll) ?? null,
    })),
  };
}

export function answersFromSnapshot(
  value: Prisma.JsonValue | null,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.fields)) return record;
  return Object.fromEntries(
    record.fields.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const field = item as Record<string, unknown>;
      return typeof field.key === 'string' && field.answer !== null
        ? [[field.key, field.answer]]
        : [];
    }),
  );
}
