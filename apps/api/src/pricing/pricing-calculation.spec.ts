import { BadRequestException } from '@nestjs/common';
import { calculatePrice, MAX_PRICE } from './pricing-calculation';
import type { PricingPriority } from './dto/calculate-price.dto';

describe('nonbinding pricing arithmetic', () => {
  it.each([
    ['normal', 100000, 0, 100000],
    ['urgent', 100000, 30000, 130000],
    ['same_day', 100000, 80000, 180000],
    ['urgent', 101, 30, 131],
    ['same_day', 101, 80, 181],
    ['urgent', 1, 0, 1],
    ['same_day', 0, 0, 0],
    ['normal', MAX_PRICE, 0, MAX_PRICE],
    ['same_day', 1193046471, 954437176, MAX_PRICE],
  ] as const)('%s on %i truncates exactly', (priority, base, extra, final) => {
    expect(calculatePrice(base, priority)).toEqual({
      base_price: base,
      priority,
      surcharge_pct: { normal: 0, urgent: 30, same_day: 80 }[priority],
      surcharge_amount: extra,
      final_price: final,
    });
  });

  it.each([-1, 1.5, NaN, Infinity, -Infinity, MAX_PRICE + 1])(
    'rejects invalid catalog price %s',
    (base) =>
      expect(() => calculatePrice(base, 'normal')).toThrow(BadRequestException),
  );

  it.each(['urgent', 'same_day'] as const)(
    'rejects %s overflow',
    (priority) => {
      expect(() => calculatePrice(MAX_PRICE, priority)).toThrow(
        BadRequestException,
      );
    },
  );

  it.each(['invalid', '__proto__', 'constructor', 'toString'])(
    'rejects %s priority',
    (priority) => {
      expect(() => calculatePrice(100, priority as PricingPriority)).toThrow(
        BadRequestException,
      );
    },
  );
});
