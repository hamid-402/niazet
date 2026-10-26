import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
export function contractTransactionError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (['P2034', 'P2002'].includes(error.code) ||
      (error.code === 'P2010' &&
        ['40001', '40P01'].includes(String(error.meta?.code))))
  )
    throw new ConflictException(
      'فرمان هم‌زمان تغییر کرده است؛ داده را بازخوانی و دوباره تلاش کنید.',
    );
  throw error;
}
