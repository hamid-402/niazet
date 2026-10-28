import { BadRequestException, ConflictException } from '@nestjs/common';

export interface OrderIntakeV1 {
  version: 1;
  goal?: string;
  brandGuidelines?: string;
  referenceUrls?: string[];
  constraints?: string;
  confidentialityRequested?: 'normal' | 'sensitive' | 'highly_sensitive';
  stagedDeliveryRequested?: boolean;
  financialNote?: string;
  addonRequests?: string[];
}

const fields = new Set([
  'version',
  'goal',
  'brandGuidelines',
  'referenceUrls',
  'constraints',
  'confidentialityRequested',
  'stagedDeliveryRequested',
  'financialNote',
  'addonRequests',
]);
const invalid = () =>
  new BadRequestException('اطلاعات تکمیلی درخواست معتبر نیست.');
function text(value: unknown, limit: number): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length > limit ||
    value.includes('\u0000')
  )
    throw invalid();
  return value.trim() || undefined;
}
function list(value: unknown, maximum: number, limit: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw invalid();
  const result = value.map((item) => {
    const normalized = text(item, limit);
    if (!normalized) throw invalid();
    return normalized;
  });
  if (new Set(result).size !== result.length) throw invalid();
  return result;
}

/** Typed request metadata only: never price, access, reservation or milestones. */
export function readOrderIntake(value: unknown): OrderIntakeV1 | null {
  if (value === undefined || value === null) return null; // legacy: unknown
  if (typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const raw = value as Record<string, unknown>;
  if (
    !Object.hasOwn(raw, 'version') ||
    raw.version !== 1 ||
    Object.keys(raw).some((key) => !fields.has(key))
  )
    throw invalid();
  const result: OrderIntakeV1 = { version: 1 };
  for (const [key, limit] of [
    ['goal', 2000],
    ['brandGuidelines', 2000],
    ['constraints', 4000],
    ['financialNote', 2000],
  ] as const)
    if (Object.hasOwn(raw, key)) {
      const normalized = text(raw[key], limit);
      if (normalized !== undefined) result[key] = normalized;
    }
  if (Object.hasOwn(raw, 'referenceUrls')) {
    result.referenceUrls = list(raw.referenceUrls, 8, 2048).map((address) => {
      if (
        Array.from(address).some(
          (character) =>
            character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        )
      )
        throw invalid();
      let url: URL;
      try {
        url = new URL(address);
      } catch {
        throw invalid();
      }
      if (url.protocol !== 'https:' || url.username || url.password)
        throw invalid();
      return url.toString();
    });
    if (new Set(result.referenceUrls).size !== result.referenceUrls.length)
      throw invalid();
  }
  if (Object.hasOwn(raw, 'confidentialityRequested')) {
    if (
      raw.confidentialityRequested !== 'normal' &&
      raw.confidentialityRequested !== 'sensitive' &&
      raw.confidentialityRequested !== 'highly_sensitive'
    )
      throw invalid();
    result.confidentialityRequested = raw.confidentialityRequested;
  }
  if (Object.hasOwn(raw, 'stagedDeliveryRequested')) {
    if (typeof raw.stagedDeliveryRequested !== 'boolean') throw invalid();
    result.stagedDeliveryRequested = raw.stagedDeliveryRequested;
  }
  if (Object.hasOwn(raw, 'addonRequests'))
    result.addonRequests = list(raw.addonRequests, 12, 200);
  // Leave room for PostgreSQL JSONB's canonical separators within its 32KiB cap.
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32000)
    throw invalid();
  return result;
}

// Only explicit schema keys, never Persian/English labels or text guessing.
const semanticKeys = {
  goal: ['goal', 'project_goal'],
  brandGuidelines: ['brand_guidelines', 'brand_colors'],
  referenceUrls: ['reference_urls'],
  constraints: ['project_constraints'],
  confidentialityRequested: ['confidentiality_level'],
  stagedDeliveryRequested: ['staged_delivery_requested'],
  financialNote: ['financial_note'],
  addonRequests: ['addon_requests'],
} as const;
export function intakeSemanticFields(
  definitions: readonly { fieldKey: string }[],
) {
  const present = new Set(definitions.map((field) => field.fieldKey));
  const result: Partial<
    Record<Exclude<keyof OrderIntakeV1, 'version'>, string>
  > = {};
  for (const [semantic, aliases] of Object.entries(semanticKeys)) {
    const matches = aliases.filter((key) => present.has(key));
    if (matches.length > 1)
      throw new ConflictException(
        'نگاشت فیلدهای هم‌معنا نیازمند بررسی قالب خدمت است.',
      );
    if (matches.length === 1)
      result[semantic as Exclude<keyof OrderIntakeV1, 'version'>] = matches[0];
  }
  return result;
}

function snapshotAnswers(snapshot: unknown) {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !Array.isArray((snapshot as { fields?: unknown }).fields)
  )
    return [];
  return (snapshot as { fields: unknown[] }).fields.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const item = value as { key?: unknown; answer?: unknown };
    return typeof item.key === 'string'
      ? [{ fieldKey: item.key, answer: item.answer }]
      : [];
  });
}

/** The existing versioned form remains the primary source for mapped fields.
 * Unsupported legacy values stay there; they are never dropped or rewritten. */
export function mergeOrderIntake(
  input: unknown,
  formSnapshot: unknown,
  fromStored = false,
): OrderIntakeV1 | null {
  const canonical = readOrderIntake(input);
  if (canonical === null) return null;
  const answers = snapshotAnswers(formSnapshot),
    mapping = intakeSemanticFields(answers);
  const merged = { ...canonical };
  for (const [semantic, key] of Object.entries(mapping)) {
    const field = semantic as Exclude<keyof OrderIntakeV1, 'version'>;
    const answer = answers.find((item) => item.fieldKey === key)?.answer;
    if (fromStored) delete merged[field];
    if (answer === null || answer === undefined || answer === '') {
      if (!fromStored && Object.hasOwn(canonical, field))
        throw new BadRequestException(
          'فیلد تخصصی و اطلاعات تکمیلیِ هم‌معنا متناقض‌اند.',
        );
      continue;
    }
    let value: unknown = answer;
    if (field === 'referenceUrls' || field === 'addonRequests')
      value = typeof answer === 'string' ? [answer] : answer;
    else if (
      field === 'brandGuidelines' &&
      Array.isArray(answer) &&
      answer.every((item) => typeof item === 'string')
    )
      value = answer.join('، ');
    let derived: OrderIntakeV1 | null;
    try {
      derived = readOrderIntake({ version: 1, [field]: value });
    } catch {
      if (!fromStored && Object.hasOwn(canonical, field))
        throw new BadRequestException(
          'تطابق فیلد تخصصی با اطلاعات تکمیلی روشن نیست؛ پاسخ اصلی را بررسی کنید.',
        );
      continue; // legacy field still exists, verbatim, in formResponses
    }
    if (
      !fromStored &&
      Object.hasOwn(canonical, field) &&
      JSON.stringify(canonical[field]) !== JSON.stringify(derived?.[field])
    )
      throw new BadRequestException(
        'فیلد تخصصی و اطلاعات تکمیلیِ هم‌معنا متناقض‌اند.',
      );
    Object.assign(merged, derived, { version: 1 });
  }
  return readOrderIntake(merged);
}

/** Extra terms are requests for human review, not included add-ons or ACLs. */
export function intakeNeedsHumanReview(
  input: unknown,
  formSnapshot: unknown,
): boolean {
  let intake: OrderIntakeV1 | null;
  try {
    intake = readOrderIntake(input);
  } catch {
    return true;
  }
  if (
    (intake?.confidentialityRequested &&
      intake.confidentialityRequested !== 'normal') ||
    intake?.stagedDeliveryRequested === true ||
    intake?.addonRequests?.length
  )
    return true;
  for (const field of snapshotAnswers(formSnapshot)) {
    if (field.answer == null || field.answer === '') continue;
    if (field.fieldKey === 'confidentiality_level' && field.answer !== 'normal')
      return true;
    if (
      field.fieldKey === 'staged_delivery_requested' &&
      field.answer !== false
    )
      return true;
    if (
      field.fieldKey === 'addon_requests' &&
      (!Array.isArray(field.answer) || field.answer.length > 0)
    )
      return true;
  }
  return false;
}
