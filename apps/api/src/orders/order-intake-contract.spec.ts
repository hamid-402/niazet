import {
  intakeSemanticFields,
  readOrderIntake,
  mergeOrderIntake,
  intakeNeedsHumanReview,
} from './order-intake-contract';

describe('versioned intake contract without financial or privacy-policy inference', () => {
  it.each([undefined, null])(
    'keeps absent legacy data unknown: %p',
    (input) => {
      expect(readOrderIntake(input)).toBeNull();
    },
  );
  it('round-trips every bounded field, preserves false and never creates a financial command', () => {
    const result = readOrderIntake({
      version: 1,
      goal: ' هدف ',
      brandGuidelines: 'لاجورد و عسل',
      referenceUrls: ['https://example.com/sample'],
      constraints: 'محدودیت زمان',
      confidentialityRequested: 'highly_sensitive',
      stagedDeliveryRequested: false,
      financialNote: 'اطلاع مشتری، نه مبلغ قابل برداشت',
      addonRequests: ['نسخه انگلیسی'],
    });
    expect(result).toEqual({
      version: 1,
      goal: 'هدف',
      brandGuidelines: 'لاجورد و عسل',
      referenceUrls: ['https://example.com/sample'],
      constraints: 'محدودیت زمان',
      confidentialityRequested: 'highly_sensitive',
      stagedDeliveryRequested: false,
      financialNote: 'اطلاع مشتری، نه مبلغ قابل برداشت',
      addonRequests: ['نسخه انگلیسی'],
    });
    expect(result).not.toHaveProperty('finalPrice');
    expect(result).not.toHaveProperty('confidentialityLevel');
    expect(result).not.toHaveProperty('milestones');
  });
  it('clears explicitly blank optional text without inventing missing values', () => {
    expect(readOrderIntake({ version: 1, goal: '  ' })).toEqual({ version: 1 });
  });
  it.each([
    {},
    [],
    1,
    '1',
    { version: 2 },
    { version: '1' },
    { version: 1, finalPrice: 1 },
    { version: 1, confidentialityLevel: 'normal' },
    { version: 1, goal: 1 },
    { version: 1, goal: 'x'.repeat(2001) },
    { version: 1, constraints: 'x'.repeat(4001) },
    { version: 1, financialNote: 'bad\u0000value' },
    { version: 1, stagedDeliveryRequested: 'true' },
    { version: 1, confidentialityRequested: 'public' },
    { version: 1, addonRequests: ['a', ' a '] },
    { version: 1, addonRequests: Array(13).fill('extra') },
    { version: 1, referenceUrls: ['javascript:alert(1)'] },
    { version: 1, referenceUrls: ['http://example.com'] },
    { version: 1, referenceUrls: ['https://user:password@example.com'] },
    { version: 1, referenceUrls: ['https://exa\nmple.com'] },
    {
      version: 1,
      referenceUrls: ['https://example.com', 'https://example.com/'],
    },
    { version: 1, referenceUrls: Array(9).fill('https://example.com') },
    JSON.parse('{"version":1,"__proto__":{"privilege":true}}') as unknown,
    Object.create({ version: 1 }) as unknown,
  ])('rejects unknown, unsafe, ambiguous or unbounded data: %p', (input) => {
    expect(() => readOrderIntake(input)).toThrow();
  });
  it('does not mutate caller data or share mutable array references', () => {
    const original = { version: 1, addonRequests: [' extra '] };
    const result = readOrderIntake(original);
    expect(original.addonRequests).toEqual([' extra ']);
    expect(result?.addonRequests).toEqual(['extra']);
    expect(result?.addonRequests).not.toBe(original.addonRequests);
  });
  it('maps only explicit schema keys and never guesses from labels', () => {
    expect(
      intakeSemanticFields([
        { fieldKey: 'project_goal' },
        { fieldKey: 'brand_colors' },
        { fieldKey: 'other' },
      ]),
    ).toEqual({ goal: 'project_goal', brandGuidelines: 'brand_colors' });
    expect(intakeSemanticFields([{ fieldKey: 'هدف' }])).toEqual({});
  });
  it('rejects conflicting semantic aliases rather than choosing a field silently', () => {
    expect(() =>
      intakeSemanticFields([
        { fieldKey: 'goal' },
        { fieldKey: 'project_goal' },
      ]),
    ).toThrow();
  });
});

describe('intake mapping preserves primary form answers and unpriced terms', () => {
  const form = (key: string, answer: unknown) => ({
    fields: [{ key, answer }],
  });
  it('derives an explicit semantic field without changing its original snapshot', () => {
    const snapshot = form('project_goal', ' هدف اصلی ');
    expect(
      mergeOrderIntake(
        { version: 1, financialNote: 'صرفاً یادداشت' },
        snapshot,
      ),
    ).toEqual({ version: 1, goal: 'هدف اصلی', financialNote: 'صرفاً یادداشت' });
    expect(snapshot.fields[0].answer).toBe(' هدف اصلی ');
  });
  it('rejects contradictory mapped data and never silently chooses an answer', () => {
    expect(() =>
      mergeOrderIntake({ version: 1, goal: 'other' }, form('goal', 'original')),
    ).toThrow();
    expect(() =>
      mergeOrderIntake({ version: 1, goal: 'other' }, form('goal', null)),
    ).toThrow();
  });
  it('updates a stored derived value from the current primary field', () => {
    expect(
      mergeOrderIntake(
        { version: 1, goal: 'old derived value' },
        form('goal', 'current'),
        true,
      ),
    ).toEqual({ version: 1, goal: 'current' });
  });
  it('retains supported legacy http and long values in the original form without coercing them into newer fields', () => {
    const snapshot = {
      fields: [
        { key: 'reference_urls', answer: 'http://legacy.example.com' },
        { key: 'goal', answer: 'a'.repeat(3000) },
      ],
    };
    expect(mergeOrderIntake({ version: 1 }, snapshot)).toEqual({ version: 1 });
    expect(snapshot.fields[0].answer).toBe('http://legacy.example.com');
    expect(snapshot.fields[1].answer.length).toBe(3000);
  });
  it.each([
    { version: 1, confidentialityRequested: 'sensitive' },
    { version: 1, confidentialityRequested: 'highly_sensitive' },
    { version: 1, stagedDeliveryRequested: true },
    { version: 1, addonRequests: ['extra'] },
  ])('requires human review for an unpriced additional term: %p', (input) => {
    expect(intakeNeedsHumanReview(input, null)).toBe(true);
  });
  it('does not classify unknown privacy data as safe or invent a risk score', () => {
    expect(
      intakeNeedsHumanReview(null, form('confidentiality_level', 'unknown')),
    ).toBe(true);
    expect(intakeNeedsHumanReview({ version: 9 }, null)).toBe(true);
  });
  it('does not treat absent metadata, false, normal privacy or empty add-ons as unpriced extras', () => {
    expect(intakeNeedsHumanReview(null, null)).toBe(false);
    expect(
      intakeNeedsHumanReview(
        {
          version: 1,
          confidentialityRequested: 'normal',
          stagedDeliveryRequested: false,
          addonRequests: [],
        },
        null,
      ),
    ).toBe(false);
    expect(
      intakeNeedsHumanReview(null, form('staged_delivery_requested', false)),
    ).toBe(false);
  });
});
