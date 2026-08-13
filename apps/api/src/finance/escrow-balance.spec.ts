import { BadRequestException } from '@nestjs/common';
import { EscrowStatus } from '@prisma/client';
import {
  calculateEscrowBalance,
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
