import { BadRequestException } from '@nestjs/common';
import type { PricingPriority } from './dto/calculate-price.dto';

const SURCHARGE_PERCENT = { normal: 0, urgent: 30, same_day: 80 } as const;
export const MAX_PRICE = 2_147_483_647;

export function calculatePrice(basePrice: number, priority: PricingPriority) {
  if (
    !Number.isInteger(basePrice) ||
    basePrice < 0 ||
    basePrice > MAX_PRICE ||
    !Object.hasOwn(SURCHARGE_PERCENT, priority)
  ) {
    throw new BadRequestException('قیمت یا اولویت برای محاسبه معتبر نیست.');
  }
  const percent = SURCHARGE_PERCENT[priority];
  // Exact integer truncation matches D1; no floating-point money arithmetic.
  const surcharge = Number((BigInt(basePrice) * BigInt(percent)) / 100n);
  const finalPrice = basePrice + surcharge;
  if (finalPrice > MAX_PRICE) {
    throw new BadRequestException('مبلغ برآورد از محدوده مجاز بیشتر است.');
  }
  return {
    base_price: basePrice,
    surcharge_pct: percent,
    surcharge_amount: surcharge,
    final_price: finalPrice,
    priority,
  };
}
