import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { IdempotencyService } from './idempotency.service';
import { CommercialClock } from '../pricing/commercial-clock';

export async function commercialReviewAccount(tx: Prisma.TransactionClient) {
  const account = await tx.ledgerAccount.upsert({
    where: { id: 'zeus-pending-payment-review-irt-v1' },
    create: {
      id: 'zeus-pending-payment-review-irt-v1',
      accountType: 'payment_pending_review',
      currency: 'IRT',
    },
    update: {},
  });
  if (
    account.accountType !== 'payment_pending_review' ||
    account.ownerUserId !== null ||
    account.currency !== 'IRT'
  )
    throw new ConflictException('حساب رسیدگی مالی معتبر نیست.');
  return account;
}

@Injectable()
export class CommercialReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly clock: CommercialClock,
  ) {}
  list() {
    return this.prisma.commercialPaymentLink.findMany({
      where: { financialReviewAt: { not: null }, resolvedAt: null },
      select: {
        paymentId: true,
        financialReviewAt: true,
        reviewReason: true,
        refundRequestedAt: true,
        payment: {
          select: { amount: true, currency: true, orderId: true, status: true },
        },
      },
      orderBy: { financialReviewAt: 'asc' },
      take: 100,
    });
  }
  refundToWallet(
    actorId: string,
    paymentId: string,
    note: string,
    key: string,
  ) {
    if (!note || note.trim().length < 3)
      throw new BadRequestException('علت واقعی مالی لازم است.');
    return this.idempotency.execute({
      key,
      scope: `commercial.refund.execute:${actorId}:${paymentId}`,
      request: { reason: note.trim() },
      work: async (tx) => {
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${payment.customerId} FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM orders WHERE id = ${payment.orderId} FOR UPDATE`,
        );
        const link = await tx.commercialPaymentLink.findUnique({
          where: { paymentId },
        });
        if (!link?.financialReviewAt || !link.refundRequestedAt)
          throw new ConflictException(
            'درخواست صریح مشتری و مدرک پرداخت دیررس لازم است.',
          );
        if (link.resolvedAt) return { alreadyProcessed: true, paymentId };
        const proof = await tx.ledgerEntry.findUnique({
          where: { idempotencyKey: `commercial-late:${paymentId}` },
        });
        const reviewAccount = await commercialReviewAccount(tx);
        if (
          !proof ||
          proof.amount !== payment.amount ||
          proof.creditAccountId !== reviewAccount.id ||
          !payment.verifiedAt ||
          payment.status !== 'verifying'
        )
          throw new ConflictException('مدرک مالی رسیدگی معتبر نیست.');
        const consistency = await this.ledger.verifyWalletConsistency(
          payment.customerId,
          tx,
        );
        if (
          !consistency.consistent ||
          consistency.walletBalance + payment.amount > 2_000_000_000
        )
          throw new ConflictException(
            'کیف پول نیاز به تطبیق یا کنترل سقف دارد.',
          );
        const walletAccount = await this.ledger.getOrCreateUserAccount(
          tx,
          payment.customerId,
          'customer_wallet',
        );
        await this.ledger.postEntry(
          {
            debitAccountId: reviewAccount.id,
            creditAccountId: walletAccount.id,
            amount: payment.amount,
            referenceType: 'refund',
            referenceId: paymentId,
            idempotencyKey: `commercial-late-refund:${paymentId}`,
            createdByUserId: actorId,
          },
          tx,
        );
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'refunded',
            failureReason: 'late_payment_refunded_to_wallet_with_consent',
          },
        });
        await tx.commercialPaymentLink.update({
          where: { paymentId },
          data: { resolvedAt: await this.clock.now(tx) },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actorId,
            actorRole: 'admin',
            action: 'commercial.payment.refunded_to_wallet',
            entityType: 'payment',
            entityId: paymentId,
            after: {
              amount: payment.amount,
              subjectCustomerId: payment.customerId,
              reason: note.trim(),
            },
            sensitivity: 'critical',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'commercial.payment.refunded_to_wallet',
            payload: {
              paymentId,
              customerId: payment.customerId,
              amount: payment.amount,
            },
          },
        });
        return {
          paymentId,
          refundedToWallet: payment.amount,
          alreadyProcessed: false,
        };
      },
    });
  }
}
