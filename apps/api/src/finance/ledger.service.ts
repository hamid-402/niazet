import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerAccountType, LedgerReferenceType, Prisma, WalletTxDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PostEntryInput {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  referenceType: LedgerReferenceType;
  referenceId: string;
  idempotencyKey?: string;
  createdByUserId?: string | null;
}

/**
 * پیاده‌سازی الحاقیه v4 بخش ۲: `ledger_entries` منبع حقیقت مالی و
 * append-only است؛ `wallets`/`wallet_transactions` صرفاً یک cache مشتق‌شده
 * هستند که همیشه در همان تراکنش دیتابیسی به‌روزرسانی می‌شوند (نه async).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateUserAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    accountType: LedgerAccountType,
  ) {
    const existing = await tx.ledgerAccount.findUnique({ where: { ownerUserId: userId } });
    if (existing) return existing;
    return tx.ledgerAccount.create({ data: { ownerUserId: userId, accountType } });
  }

  /** حساب‌های سیستمی (platform_escrow, platform_commission, payment_gateway_clearing) در seed ساخته می‌شوند. */
  async getSystemAccount(accountType: LedgerAccountType) {
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { accountType, ownerUserId: null },
    });
    if (!account) {
      throw new NotFoundException(`حساب سیستمی ${accountType} یافت نشد؛ seed را اجرا کنید.`);
    }
    return account;
  }

  /**
   * ثبت یک entry دوطرفه و به‌روزرسانی cache کیف پول در همان تراکنش دیتابیسی.
   * idempotencyKey تضمین می‌کند عملیات مالی دوبار اجرا نشود (سند v4 §۱۲.۲/۲۷).
   */
  async postEntry(input: PostEntryInput, tx?: Prisma.TransactionClient) {
    const runner = tx ?? this.prisma;

    if (input.idempotencyKey) {
      const existing = await runner.ledgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    if (input.amount <= 0) {
      throw new BadRequestException('مبلغ تراکنش مالی باید مثبت باشد.');
    }

    const exec = async (client: Prisma.TransactionClient) => {
      const entry = await client.ledgerEntry.create({
        data: {
          debitAccountId: input.debitAccountId,
          creditAccountId: input.creditAccountId,
          amount: input.amount,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          idempotencyKey: input.idempotencyKey,
          createdByUserId: input.createdByUserId ?? null,
        },
      });

      await this.projectToWallet(client, entry.debitAccountId, entry, WalletTxDirection.debit);
      await this.projectToWallet(client, entry.creditAccountId, entry, WalletTxDirection.credit);

      return entry;
    };

    if (tx) {
      return exec(tx);
    }
    return this.prisma.$transaction((trx) => exec(trx));
  }

  private async projectToWallet(
    client: Prisma.TransactionClient,
    accountId: string,
    entry: { id: string; amount: number; referenceType: LedgerReferenceType; referenceId: string },
    direction: WalletTxDirection,
  ) {
    const account = await client.ledgerAccount.findUnique({ where: { id: accountId } });
    if (!account?.ownerUserId) {
      return; // حساب سیستمی است، کیف پول کاربری ندارد.
    }

    const wallet = await client.wallet.upsert({
      where: { userId: account.ownerUserId },
      create: { userId: account.ownerUserId },
      update: {},
    });

    const delta = direction === WalletTxDirection.credit ? entry.amount : -entry.amount;
    const updatedWallet = await client.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: delta } },
    });

    await client.walletTransaction.create({
      data: {
        walletId: wallet.id,
        ledgerEntryId: entry.id,
        direction,
        amount: entry.amount,
        balanceAfter: updatedWallet.balance,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
      },
    });
  }

  /** قانون طلایی الحاقیه §۲.۶: SUM(credit) - SUM(debit) باید با wallets.balance برابر باشد. */
  async verifyWalletConsistency(userId: string) {
    const account = await this.prisma.ledgerAccount.findUnique({ where: { ownerUserId: userId } });
    if (!account) return { consistent: true, ledgerBalance: 0, walletBalance: 0 };

    const [creditSum, debitSum, wallet] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { creditAccountId: account.id },
      }),
      this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { debitAccountId: account.id },
      }),
      this.prisma.wallet.findUnique({ where: { userId } }),
    ]);

    const ledgerBalance = (creditSum._sum.amount ?? 0) - (debitSum._sum.amount ?? 0);
    const walletBalance = wallet?.balance ?? 0;

    return { consistent: ledgerBalance === walletBalance, ledgerBalance, walletBalance };
  }

  listEntries(params: {
    referenceType?: LedgerReferenceType;
    referenceId?: string;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.ledgerEntry.findMany({
      where: {
        ...(params.referenceType ? { referenceType: params.referenceType } : {}),
        ...(params.referenceId ? { referenceId: params.referenceId } : {}),
      },
      include: { debitAccount: true, creditAccount: true },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }
}
