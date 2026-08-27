import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerAccountType,
  LedgerReferenceType,
  Prisma,
  WalletTxDirection,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PostEntryInput {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  referenceType: LedgerReferenceType;
  referenceId: string;
  idempotencyKey?: string;
  createdByUserId?: string | null;
  correctionOfId?: string;
}

type LedgerCsvEntry = {
  id: string;
  createdAt: Date;
  amount: number;
  referenceType: string;
  referenceId: string;
  correctionOfId: string | null;
  createdByUserId: string | null;
  debitAccount: { accountType: string };
  creditAccount: { accountType: string };
};

function csvCell(value: string | number | null) {
  const raw = value == null ? '' : String(value);
  const protectedValue = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function buildLedgerCsv(entries: LedgerCsvEntry[]) {
  const header = [
    'id',
    'created_at',
    'debit_account',
    'credit_account',
    'amount_irt',
    'reference_type',
    'reference_id',
    'correction_of_id',
    'created_by_user_id',
  ];
  const rows = entries.map((entry) => [
    entry.id,
    entry.createdAt.toISOString(),
    entry.debitAccount.accountType,
    entry.creditAccount.accountType,
    entry.amount,
    entry.referenceType,
    entry.referenceId,
    entry.correctionOfId,
    entry.createdByUserId,
  ]);
  return [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
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
    const existing = await tx.ledgerAccount.findUnique({
      where: { ownerUserId: userId },
    });
    if (existing) return existing;
    return tx.ledgerAccount.create({
      data: { ownerUserId: userId, accountType },
    });
  }

  /** حساب‌های سیستمی (platform_escrow, platform_commission, payment_gateway_clearing) در seed ساخته می‌شوند. */
  async getSystemAccount(
    accountType: LedgerAccountType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const account = await client.ledgerAccount.findFirst({
      where: { accountType, ownerUserId: null },
    });
    if (!account) {
      throw new NotFoundException(
        `حساب سیستمی ${accountType} یافت نشد؛ seed را اجرا کنید.`,
      );
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
          correctionOfId: input.correctionOfId,
        },
      });

      await this.projectToWallet(
        client,
        entry.debitAccountId,
        entry,
        WalletTxDirection.debit,
      );
      await this.projectToWallet(
        client,
        entry.creditAccountId,
        entry,
        WalletTxDirection.credit,
      );

      return entry;
    };

    if (tx) {
      return exec(tx);
    }
    return this.prisma.$transaction((trx) => exec(trx));
  }

  async postCorrection(params: {
    originalEntryId: string;
    reason: string;
    createdByUserId: string;
    idempotencyKey: string;
  }) {
    if (!params.idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key برای اصلاح سند الزامی است.',
      );
    }
    const existing = await this.prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: `ledger-correction:${params.idempotencyKey}` },
    });
    if (existing) return existing;
    return this.prisma.$transaction(
      async (tx) => {
        const original = await tx.ledgerEntry.findUnique({
          where: { id: params.originalEntryId },
        });
        if (!original) throw new NotFoundException('سند مالی اصلی یافت نشد.');

        const correction = await this.postEntry(
          {
            debitAccountId: original.creditAccountId,
            creditAccountId: original.debitAccountId,
            amount: original.amount,
            referenceType: original.referenceType,
            referenceId: original.referenceId,
            correctionOfId: original.id,
            idempotencyKey: `ledger-correction:${params.idempotencyKey}`,
            createdByUserId: params.createdByUserId,
          },
          tx,
        );
        await tx.auditLog.create({
          data: {
            actorUserId: params.createdByUserId,
            actorRole: 'admin',
            action: 'ledger.correction',
            entityType: 'ledger_entry',
            entityId: correction.id,
            before: { originalEntryId: original.id },
            after: { reason: params.reason },
            sensitivity: 'critical',
          },
        });
        return correction;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async projectToWallet(
    client: Prisma.TransactionClient,
    accountId: string,
    entry: {
      id: string;
      amount: number;
      referenceType: LedgerReferenceType;
      referenceId: string;
    },
    direction: WalletTxDirection,
  ) {
    const account = await client.ledgerAccount.findUnique({
      where: { id: accountId },
    });
    if (!account?.ownerUserId) {
      return; // حساب سیستمی است، کیف پول کاربری ندارد.
    }

    const wallet = await client.wallet.upsert({
      where: { userId: account.ownerUserId },
      create: { userId: account.ownerUserId },
      update: {},
    });

    const delta =
      direction === WalletTxDirection.credit ? entry.amount : -entry.amount;
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
  async verifyWalletConsistency(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const account = await client.ledgerAccount.findUnique({
      where: { ownerUserId: userId },
    });
    if (!account)
      return { consistent: true, ledgerBalance: 0, walletBalance: 0 };

    const [creditSum, debitSum, wallet] = await Promise.all([
      client.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { creditAccountId: account.id },
      }),
      client.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { debitAccountId: account.id },
      }),
      client.wallet.findUnique({ where: { userId } }),
    ]);

    const ledgerBalance =
      (creditSum._sum.amount ?? 0) - (debitSum._sum.amount ?? 0);
    const walletBalance = wallet?.balance ?? 0;

    return {
      consistent: ledgerBalance === walletBalance,
      ledgerBalance,
      walletBalance,
    };
  }

  async verifyAllWallets(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const wallets = await client.wallet.findMany({
      select: { userId: true },
    });
    const results = await Promise.all(
      wallets.map((wallet) => this.verifyWalletConsistency(wallet.userId, tx)),
    );
    const inconsistencies = results
      .map((result, index) => ({ userId: wallets[index].userId, ...result }))
      .filter((result) => !result.consistent);

    if (inconsistencies.length) {
      const report = async (trx: Prisma.TransactionClient) => {
        const financeAdmins = await trx.user.findMany({
          where: {
            role: 'admin',
            status: 'active',
            adminScope: { in: ['finance_admin', 'super_admin'] },
          },
          select: { id: true },
        });
        await trx.auditLog.create({
          data: {
            action: 'finance.reconciliation_failed',
            entityType: 'wallets',
            entityId: 'all',
            after: inconsistencies,
            sensitivity: 'critical',
          },
        });
        await trx.outboxEvent.create({
          data: {
            eventType: 'finance.critical_reconciliation_alert',
            payload: { severity: 'CRITICAL', inconsistencies },
          },
        });
        if (financeAdmins.length) {
          await trx.notificationLog.createMany({
            data: financeAdmins.map((admin) => ({
              userId: admin.id,
              channel: 'in_app',
              eventType: 'finance.critical_reconciliation_alert',
              title: 'هشدار بحرانی مغایرت مالی',
              body: `${inconsistencies.length} مغایرت بین Ledger و Wallet شناسایی شد.`,
              sentAt: new Date(),
            })),
          });
        }
      };
      if (tx) await report(tx);
      else await this.prisma.$transaction((trx) => report(trx));
    }

    return {
      checked: wallets.length,
      consistent: inconsistencies.length === 0,
      inconsistencies,
    };
  }

  listEntries(params: {
    referenceType?: LedgerReferenceType;
    referenceId?: string;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.ledgerEntry.findMany({
      where: {
        ...(params.referenceType
          ? { referenceType: params.referenceType }
          : {}),
        ...(params.referenceId ? { referenceId: params.referenceId } : {}),
      },
      include: { debitAccount: true, creditAccount: true },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async exportCsv(params: { referenceId?: string }) {
    const entries = await this.listEntries({
      referenceId: params.referenceId,
      take: 10_000,
    });
    // BOM باعث می‌شود Excel متن UTF-8 را بدون به‌هم‌ریختگی باز کند.
    return `\uFEFF${buildLedgerCsv(entries)}`;
  }
}
