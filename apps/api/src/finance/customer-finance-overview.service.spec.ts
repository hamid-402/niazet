import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, RefundStatus } from '@prisma/client';
import { calculateCustomerFinanceTotals } from './customer-finance-overview.service';

describe('customer finance totals', () => {
  it('counts only settled money and preserves remaining escrow', () => {
    expect(calculateCustomerFinanceTotals({
      payments: [
        { amount: 1_000, status: PaymentStatus.succeeded },
        { amount: 700, status: PaymentStatus.failed },
        { amount: 250, status: PaymentStatus.pending },
      ],
      escrows: [
        { amount: 1_000, releasedAmount: 200, refundedAmount: 100 },
        { amount: 500, releasedAmount: 500, refundedAmount: 0 },
      ],
      refunds: [
        { amount: 100, status: RefundStatus.processed },
        { amount: 90, status: RefundStatus.requested },
      ],
      pendingPaymentCount: 3,
    })).toEqual({ totalPaid: 1_000, totalHeld: 700, totalRefunded: 100, pendingPaymentCount: 3 });
  });

  it('returns stable zero totals for an empty account', () => {
    expect(calculateCustomerFinanceTotals({ payments: [], escrows: [], refunds: [], pendingPaymentCount: 0 }))
      .toEqual({ totalPaid: 0, totalHeld: 0, totalRefunded: 0, pendingPaymentCount: 0 });
  });

  it('fails closed on an over-distributed escrow instead of reporting a negative balance', () => {
    expect(() => calculateCustomerFinanceTotals({
      payments: [],
      escrows: [{ amount: 100, releasedAmount: 80, refundedAmount: 30 }],
      refunds: [],
      pendingPaymentCount: 0,
    })).toThrow(BadRequestException);
  });
});
