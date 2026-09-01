import { BadRequestException } from '@nestjs/common';
import { EscrowStatus } from '@prisma/client';
import {
  calculateEscrowBalance,
  calculateEscrowReleaseDistribution,
  escrowStatusAfterDistribution,
} from './escrow.service';

describe('escrow balance invariants', () => {
  it('calculates remaining funds from cumulative release and refund', () => {
    expect(
      calculateEscrowBalance({
        amount: 1_000,
        releasedAmount: 300,
        refundedAmount: 200,
      }),
    ).toEqual({ released: 300, refunded: 200, remaining: 500 });
  });

  it('rejects a historically over-distributed escrow', () => {
    expect(() =>
      calculateEscrowBalance({
        amount: 1_000,
        releasedAmount: 700,
        refundedAmount: 400,
      }),
    ).toThrow(BadRequestException);
  });

  it.each([
    { amount: 0, releasedAmount: 0, refundedAmount: 0 },
    { amount: 1_000, releasedAmount: -1, refundedAmount: 0 },
    { amount: 1_000, releasedAmount: 0, refundedAmount: -1 },
  ])('rejects invalid escrow components: %o', (escrow) => {
    expect(() => calculateEscrowBalance(escrow)).toThrow(BadRequestException);
  });

  it.each([
    [1_000, 0, 1_000, 0],
    [1_000, 0.2, 800, 200],
    [101, 0.25, 76, 25],
    [10_000, 0.333, 6_670, 3_330],
  ])('splits amount=%i at rate=%f into executor=%i commission=%i', (amount, rate, executorAmount, commissionAmount) => {
    expect(calculateEscrowReleaseDistribution(amount, rate)).toEqual({ executorAmount, commissionAmount });
  });

  it.each([[0, 0.2], [-1, 0.2], [100, -0.01], [100, 1.01], [100, 1]])(
    'rejects unsafe release distribution amount=%f rate=%f',
    (amount, rate) => {
      expect(() => calculateEscrowReleaseDistribution(amount, rate)).toThrow(BadRequestException);
    },
  );

  it.each([
    [0, 0, 1_000, EscrowStatus.held],
    [300, 0, 700, EscrowStatus.partially_released],
    [0, 300, 700, EscrowStatus.partially_refunded],
    [1_000, 0, 0, EscrowStatus.released],
    [0, 1_000, 0, EscrowStatus.refunded],
    [600, 400, 0, EscrowStatus.settled],
  ])(
    'maps released=%i refunded=%i remaining=%i to %s',
    (released, refunded, remaining, expected) => {
      expect(
        escrowStatusAfterDistribution({ released, refunded, remaining }),
      ).toBe(expected);
    },
  );
});
