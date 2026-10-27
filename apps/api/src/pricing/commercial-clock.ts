import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class CommercialClock {
  async now(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT clock_timestamp() AS now`;
    return rows[0].now;
  }
}
