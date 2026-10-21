import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerAccountType,
  LedgerReferenceType,
  WithdrawalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';

const DEFAULT_MIN_WITHDRAWAL = 100_000;
const DEFAULT_MAX_WITHDRAWAL = 500_000_000;

export function isValidIranianShaba(value: string) {
  if (!/^IR\d{24}$/.test(value)) return false;
  const rearranged = `${value.slice(4)}1827${value.slice(2, 4)}`;
  let remainder = 0;
  for (const digit of rearranged)
    remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async verifyShaba(
    executorProfileId: string,
    shabaNumber: string,
    adminId: string,
  ) {
    if (!isValidIranianShaba(shabaNumber)) {
      throw new BadRequestException(
        'شماره شبا از نظر ساختار و رقم کنترل معتبر نیست.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.executorProfile.update({
        where: { id: executorProfileId },
        data: { shabaNumber, shabaVerifiedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminId,
          actorRole: 'admin',
          action: 'executor.shaba_verified',
          entityType: 'executor_profile',
          entityId: executorProfileId,
          after: { shabaLast4: shabaNumber.slice(-4) },
          sensitivity: 'critical',
        },
      });
      return profile;
    });
  }

  async requestForUser(
    executorUserId: string,
    amount: number,
    shabaNumber: string,
    idempotencyKey: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      scope: `withdrawal.request:${executorUserId}`,
      request: { amount, shabaNumber },
      work: async (tx) => {
        const profile = await tx.executorProfile.findUnique({
          where: { userId: executorUserId },
        });
        if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
        if (
          !profile.shabaVerifiedAt ||
          profile.shabaNumber !== shabaNumber ||
          !isValidIranianShaba(shabaNumber)
        ) {
          throw new BadRequestException(
            'برداشت فقط به شبای تأییدشده مجری ممکن است.',
          );
        }

        const settings = await tx.systemSetting.findMany({
          where: {
            key: { in: ['finance.withdrawal_min', 'finance.withdrawal_max'] },
          },
        });
        const setting = (key: string, fallback: number) => {
          const value = settings.find((item) => item.key === key)?.value;
          return typeof value === 'number' ? value : fallback;
        };
        const min = setting('finance.withdrawal_min', DEFAULT_MIN_WITHDRAWAL);
        const max = setting('finance.withdrawal_max', DEFAULT_MAX_WITHDRAWAL);
        if (amount < min || amount > max) {
          throw new BadRequestException(
            `مبلغ برداشت باید بین ${min} و ${max} تومان باشد.`,
          );
        }

        const [wallet, reserved] = await Promise.all([
          tx.wallet.findUnique({ where: { userId: executorUserId } }),
          tx.withdrawal.aggregate({
            _sum: { amount: true },
            where: {
              executorProfileId: profile.id,
              status: {
                in: [WithdrawalStatus.pending, WithdrawalStatus.approved],
              },
              processedAt: null,
            },
          }),
        ]);
        const available = (wallet?.balance ?? 0) - (reserved._sum.amount ?? 0);
        if (amount > available)
          throw new BadRequestException('موجودی قابل برداشت کافی نیست.');

        const withdrawal = await tx.withdrawal.create({
          data: {
            executorProfileId: profile.id,
            amount,
            shabaNumber,
            shabaVerifiedAt: profile.shabaVerifiedAt,
            status: WithdrawalStatus.pending,
            idempotencyKey: `withdrawal:${executorUserId}:${idempotencyKey}`,
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'withdrawal.requested',
            payload: {
              withdrawalId: withdrawal.id,
              executorProfileId: profile.id,
              amount,
            },
          },
        });
        return withdrawal;
      },
    });
  }

  listForAdmin(status?: WithdrawalStatus) {
    return this.prisma.withdrawal.findMany({
      where: status ? { status } : {},
      include: {
        executorProfile: {
          select: { displayAlias: true, publicHandlerCode: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  decide(
    id: string,
    approve: boolean,
    decidedByUserId: string,
    note: string | undefined,
    idempotencyKey: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      scope: `withdrawal.decide:${id}`,
      request: { approve, note: note ?? null },
      work: async (tx) => {
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id },
          include: { executorProfile: true },
        });
        if (!withdrawal)
          throw new NotFoundException('درخواست برداشت یافت نشد.');
        if (withdrawal.status !== WithdrawalStatus.pending) {
          throw new ConflictException('این درخواست قبلاً تصمیم‌گیری شده است.');
        }
        if (approve) {
          const [executorAccount, clearingAccount] = await Promise.all([
            this.ledger.getOrCreateUserAccount(
              tx,
              withdrawal.executorProfile.userId,
              LedgerAccountType.executor_wallet,
            ),
            this.ledger.getSystemAccount(
              LedgerAccountType.payment_gateway_clearing,
              tx,
            ),
          ]);
          await this.ledger.postEntry(
            {
              debitAccountId: executorAccount.id,
              creditAccountId: clearingAccount.id,
              amount: withdrawal.amount,
              referenceType: LedgerReferenceType.withdrawal,
              referenceId: withdrawal.id,
              idempotencyKey: `withdrawal-process:${withdrawal.id}`,
              createdByUserId: decidedByUserId,
            },
            tx,
          );
        }
        const updated = await tx.withdrawal.update({
          where: { id },
          data: {
            status: approve
              ? WithdrawalStatus.approved
              : WithdrawalStatus.rejected,
            decidedByUserId,
            decidedAt: new Date(),
            processedAt: approve ? new Date() : null,
            note,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: decidedByUserId,
            actorRole: 'admin',
            action: approve ? 'withdrawal.approved' : 'withdrawal.rejected',
            entityType: 'withdrawal',
            entityId: id,
            after: { amount: withdrawal.amount, note: note ?? null },
            sensitivity: 'critical',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: approve ? 'withdrawal.approved' : 'withdrawal.rejected',
            payload: { withdrawalId: id, amount: withdrawal.amount },
          },
        });
        return updated;
      },
    });
  }
}
