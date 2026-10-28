import { BadRequestException } from '@nestjs/common';
import { calculateFormulaPrice, readLinearPriceFormula } from './formula-price';
import { MAX_PRICE } from './pricing-calculation';

function formula() {
  return {
    type: 'linear-v1',
    version: 2,
    currency: 'IRT',
    basePrice: 100,
    maxBasePrice: 1_000_000,
    terms: [{ key: 'pages', unitPrice: 101, min: 1, max: 100 }],
  };
}

describe('Z2 bounded data-only formula', () => {
  it.each([
    ['normal', 302, 0, 302],
    ['urgent', 302, 90, 392],
    ['same_day', 302, 241, 543],
  ] as const)(
    'calculates exact %s price from the base, not a previous final',
    (priority, base, extra, final) => {
      const input = formula(),
        quantities = { pages: 2 };
      const before = JSON.stringify([input, quantities]);
      const result = calculateFormulaPrice(input, quantities, priority);
      expect(result).toMatchObject({
        base_price: base,
        surcharge_amount: extra,
        final_price: final,
      });
      expect(result.inputs_snapshot).toEqual(quantities);
      expect(result.formula_snapshot.version).toBe(2);
      expect(calculateFormulaPrice(input, quantities, priority)).toEqual(
        result,
      );
      expect(JSON.stringify([input, quantities])).toBe(before);
    },
  );

  it('copies and freezes snapshot inputs and terms without freezing the caller', () => {
    const input = formula(),
      quantities = { pages: 2 };
    const result = calculateFormulaPrice(input, quantities, 'normal');
    input.terms[0].unitPrice = 999;
    quantities.pages = 10;
    expect(result.formula_snapshot.terms[0].unitPrice).toBe(101);
    expect(result.inputs_snapshot.pages).toBe(2);
    expect(Object.isFrozen(result.formula_snapshot.terms[0])).toBe(true);
    expect(Object.isFrozen(result.inputs_snapshot)).toBe(true);
  });

  it.each([
    null,
    [],
    'pages*100',
    { pages: '2' },
    { pages: 1.5 },
    { pages: -1 },
    { pages: 0 },
    { pages: 101 },
    { pages: NaN },
    { pages: Infinity },
    {},
    { pages: 2, extra: 1 },
  ])('rejects invalid/missing/additional input %#', (inputs) => {
    expect(() => calculateFormulaPrice(formula(), inputs, 'normal')).toThrow(
      BadRequestException,
    );
  });

  it.each([
    { type: 'javascript' },
    { currency: 'IRR' },
    { version: 0 },
    { version: '1' },
    { basePrice: -1 },
    { maxBasePrice: 100 },
    { maxBasePrice: MAX_PRICE + 1 },
    { code: 'process.exit()' },
    {
      terms: Array.from({ length: 33 }, () => ({
        key: 'x',
        unitPrice: 1,
        min: 0,
        max: 1,
      })),
    },
    { terms: [{ key: 'pages', unitPrice: 1, min: 2, max: 1 }] },
    { terms: [{ key: 'pages', unitPrice: 1, min: 0, max: 1_000_001 }] },
  ])('rejects unsupported or unbounded configuration %#', (changes) => {
    expect(() => readLinearPriceFormula({ ...formula(), ...changes })).toThrow(
      BadRequestException,
    );
  });

  it.each([
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'pages.price',
    'pages()',
    'x'.repeat(65),
  ])('rejects unsafe or duplicate term name %s', (key) => {
    const input = formula();
    input.terms[0].key = key;
    expect(() => readLinearPriceFormula(input)).toThrow(BadRequestException);
  });

  it('rejects duplicate keys, holes and accessors in term arrays without executing them', () => {
    const input = formula(),
      getter = jest.fn(() => input.terms[0]);
    const accessor: unknown[] = [];
    Object.defineProperty(accessor, '0', { get: getter, enumerable: true });
    for (const terms of [
      [...input.terms, ...input.terms],
      Array(1),
      accessor,
    ]) {
      expect(() => readLinearPriceFormula({ ...input, terms })).toThrow(
        BadRequestException,
      );
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects getters, inherited configuration, symbols and executable values without invoking them', () => {
    const getter = jest.fn(() => 2);
    for (const input of [
      Object.defineProperty({}, 'pages', { get: getter, enumerable: true }),
      Object.create({ pages: 2 }),
      { pages: () => 2 },
      { pages: 2, [Symbol('x')]: 1 },
    ]) {
      expect(() => calculateFormulaPrice(formula(), input, 'normal')).toThrow(
        BadRequestException,
      );
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('supports bounded zero and the integer maximum but rejects surcharge/term overflow', () => {
    expect(
      calculateFormulaPrice(
        { ...formula(), basePrice: 0, maxBasePrice: 0, terms: [] },
        {},
        'same_day',
      ).final_price,
    ).toBe(0);
    const largest = {
      ...formula(),
      basePrice: MAX_PRICE,
      maxBasePrice: MAX_PRICE,
      terms: [],
    };
    expect(calculateFormulaPrice(largest, {}, 'normal').final_price).toBe(
      MAX_PRICE,
    );
    expect(() => calculateFormulaPrice(largest, {}, 'urgent')).toThrow(
      BadRequestException,
    );
    expect(() =>
      calculateFormulaPrice(
        { ...formula(), maxBasePrice: 202 },
        { pages: 2 },
        'normal',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      calculateFormulaPrice(
        {
          ...formula(),
          maxBasePrice: MAX_PRICE,
          terms: [{ key: 'x', unitPrice: MAX_PRICE, min: 0, max: 1_000_000 }],
        },
        { x: 1_000_000 },
        'normal',
      ),
    ).toThrow(BadRequestException);
  });

  it('does not accidentally round one-toman fractions up over a range of bases', () => {
    for (let base = 0; base <= 1000; base++) {
      const input = { ...formula(), basePrice: base, terms: [] };
      for (const [priority, rate] of [
        ['normal', 0],
        ['urgent', 30],
        ['same_day', 80],
      ] as const) {
        const result = calculateFormulaPrice(input, {}, priority);
        expect(result.final_price).toBe(
          base + Number((BigInt(base) * BigInt(rate)) / 100n),
        );
      }
    }
  });
});
