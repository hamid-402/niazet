import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LedgerAccountType,
  LedgerReferenceType,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';
import { PaymentGatewayService } from './zarinpal.gateway';
import { OrderWorkflowService } from '../orders/domain/order-workflow.service';
import { CommercialService } from '../pricing/commercial.service';
import { CommercialClock } from '../pricing/commercial-clock';

export const MAX_WALLET_AMOUNT = 2_000_000_000;
export function assertWalletAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_WALLET_AMOUNT)
    throw new BadRequestException(
      'مبلغ کیف پول باید عدد صحیح مثبت در محدوده مجاز تومان باشد.',
    );
}

@Injectable()
export class WalletPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly gateway: PaymentGatewayService,
    private readonly config: ConfigService,
    private readonly workflow: OrderWorkflowService = new OrderWorkflowService(
      prisma,
    ),
    private readonly commercial: CommercialService = new CommercialService(
      prisma,
      idempotency,
      workflow,
      new CommercialClock(),
    ),
  ) {}

  private enabled() {
    // Local activation requires the approved migration/rehearsal first.
    // Live/production activation is deferred; existing routes stay intact off.
    const enabled = this.config.get<string | boolean>('ZEUS_WALLET_ENABLED');
    if (enabled !== true && enabled !== 'true')
      throw new ServiceUnavailableException(
        'کیف پول تکمیلی هنوز در این محیط فعال نشده است.',
      );
    if (
      !['development', 'test'].includes(
        this.config.get<string>('NODE_ENV') ?? '',
      )
    )
      throw new ServiceUnavailableException(
        'کیف پول آزمایشی در محیط تولید مجاز نیست.',
      );
    if (this.gateway.name !== 'mock')
      throw new ServiceUnavailableException(
        'اتصال زنده کیف پول تا پذیرش مستقل فعال نیست.',
      );
  }

  private async lockOwner(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`,
    );
    if (!rows.length) throw new NotFoundException('حساب یافت نشد.');
  }

  list(userId: string) {
    this.enabled();
    return this.prisma.walletFundingIntent.findMany({
      where: { userId },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        verifiedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  initiate(userId: string, amount: number, key: string) {
    this.enabled();
    assertWalletAmount(amount);
    return this.idempotency.execute({
      key,
      scope: `wallet.topup.initiate:${userId}`,
      request: { amount },
      work: async (tx) => {
        await this.lockOwner(tx, userId);
        const intent = await tx.walletFundingIntent.create({
          data: {
            userId,
            amount,
            gateway: this.gateway.name,
            idempotencyKey: `wallet-topup:${userId}:${this.idempotency.requireKey(key)}`,
          },
        });
        const callback = `${String(this.config.get('WEB_URL') ?? 'http://localhost:3002').replace(/\/$/, '')}/wallet?topUpId=${encodeURIComponent(intent.id)}`;
        const payment = await this.gateway.createPaymentRequest({
          amount,
          orderId: intent.id,
          callbackUrl: callback,
        });
        await tx.walletFundingIntent.update({
          where: { id: intent.id },
          data: {
            status: PaymentStatus.verifying,
            gatewayRef: payment.gatewayRef,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            actorRole: 'customer',
            action: 'wallet.topup.initiated',
            entityType: 'wallet_funding_intent',
            entityId: intent.id,
            after: { amount },
            sensitivity: 'critical',
          },
        });
        return {
          id: intent.id,
          amount,
          status: PaymentStatus.verifying,
          redirectUrl: payment.redirectUrl,
        };
      },
    });
  }

  verify(userId: string, intentId: string, key: string) {
    this.enabled();
    return this.idempotency.execute({
      key,
      scope: `wallet.topup.verify:${userId}:${intentId}`,
      request: { userId, intentId },
      work: async (tx) => {
        await this.lockOwner(tx, userId);
        const intent = await tx.walletFundingIntent.findFirst({
          where: { id: intentId, userId },
        });
        if (!intent) throw new NotFoundException('پرداخت کیف پول یافت نشد.');
        if (intent.status === PaymentStatus.succeeded)
          return {
            id: intent.id,
            amount: intent.amount,
            status: intent.status,
            alreadyProcessed: true,
          };
        if (
          intent.status !== PaymentStatus.verifying ||
          !intent.gatewayRef ||
          intent.gateway !== this.gateway.name
        )
          throw new BadRequestException('پرداخت قابل تأیید نیست.');
        const consistency = await this.ledger.verifyWalletConsistency(
          userId,
          tx,
        );
        if (
          !consistency.consistent ||
          consistency.walletBalance + intent.amount > MAX_WALLET_AMOUNT
        )
          throw new ConflictException(
            'کیف پول نیاز به تطبیق یا کنترل سقف موجودی دارد.',
          );
        const verification = await this.gateway.verifyPayment({
          gatewayRef: intent.gatewayRef,
          amount: intent.amount,
        });
        if (!verification.verified)
          throw new BadRequestException('پرداخت تأیید نشد.');
        const claimed = await tx.walletFundingIntent.updateMany({
          where: { id: intent.id, userId, status: PaymentStatus.verifying },
          data: { status: PaymentStatus.succeeded, verifiedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new ConflictException('پرداخت هم‌زمان تغییر کرد.');
        const account = await this.ledger.getOrCreateUserAccount(
          tx,
          userId,
          LedgerAccountType.customer_wallet,
        );
        const clearing = await this.ledger.getSystemAccount(
          LedgerAccountType.payment_gateway_clearing,
          tx,
        );
        await this.ledger.postEntry(
          {
            debitAccountId: clearing.id,
            creditAccountId: account.id,
            amount: intent.amount,
            referenceType: LedgerReferenceType.payment,
            referenceId: intent.id,
            idempotencyKey: `wallet-topup-settle:${intent.id}`,
            createdByUserId: userId,
          },
          tx,
        );
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            actorRole: 'customer',
            action: 'wallet.topup.settled',
            entityType: 'wallet_funding_intent',
            entityId: intent.id,
            after: { amount: intent.amount },
            sensitivity: 'critical',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'wallet.topup.succeeded',
            payload: { userId, intentId: intent.id, amount: intent.amount },
          },
        });
        return {
          id: intent.id,
          amount: intent.amount,
          status: PaymentStatus.succeeded,
          alreadyProcessed: false,
        };
      },
    });
  }

  payOrder(userId: string, orderId: string, key: string, milestoneId?: string) {
    this.enabled();
    return this.idempotency.execute({
      key,
      scope: `wallet.order.pay:${userId}:${orderId}`,
      request: { userId, orderId, milestoneId: milestoneId ?? null },
      work: async (tx) => {
        await this.lockOwner(tx, userId);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
        );
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId: userId },
          include: { milestones: true },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (
          order.status !== OrderStatus.pending_payment ||
          !order.finalPrice ||
          order.currency !== 'IRT'
        )
          throw new BadRequestException('سفارش قیمت قطعی قابل پرداخت ندارد.');
        const unpaid = order.milestones.filter(
          (m) => m.paymentStatus !== PaymentStatus.succeeded,
        );
        if (
          order.milestones.length &&
          (order.milestones.some(
            (m) => !Number.isSafeInteger(m.amount) || m.amount < 1,
          ) ||
            order.milestones.reduce((sum, m) => sum + m.amount, 0) !==
              order.finalPrice)
        )
          throw new ConflictException(
            'جمع مراحل پرداخت با قیمت قطعی سفارش منطبق نیست.',
          );
        const milestone = milestoneId
          ? unpaid.find((m) => m.id === milestoneId)
          : undefined;
        if (
          (milestoneId && !milestone) ||
          (!milestoneId && order.milestones.length)
        )
          throw new BadRequestException(
            'مرحله پرداخت را به‌درستی انتخاب کنید.',
          );
        const amount = milestone?.amount ?? order.finalPrice;
        await this.commercial.assertPayable(tx, orderId);
        assertWalletAmount(amount);
        // Gateway intent in flight must be resolved before switching payment rail.
        const pending = await tx.payment.count({
          where: {
            orderId,
            status: { in: [PaymentStatus.pending, PaymentStatus.verifying] },
            ...(milestoneId ? { milestoneId } : {}),
          },
        });
        if (pending)
          throw new ConflictException(
            'ابتدا وضعیت پرداخت در حال بررسی را تعیین تکلیف کنید.',
          );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM wallets WHERE user_id = ${userId} FOR UPDATE`,
        );
        const consistency = await this.ledger.verifyWalletConsistency(
          userId,
          tx,
        );
        if (!consistency.consistent || consistency.ledgerBalance == null)
          throw new ConflictException(
            'موجودی کیف پول نیاز به تطبیق مالی دارد.',
          );
        if (consistency.walletBalance < amount)
          throw new BadRequestException('موجودی کیف پول کافی نیست.');
        const account = await this.ledger.getOrCreateUserAccount(
          tx,
          userId,
          LedgerAccountType.customer_wallet,
        );
        const escrowAccount = await this.ledger.getSystemAccount(
          LedgerAccountType.platform_escrow,
          tx,
        );
        const payment = await tx.payment.create({
          data: {
            orderId,
            customerId: userId,
            milestoneId,
            amount,
            gateway: 'wallet',
            status: PaymentStatus.succeeded,
            verifiedAt: new Date(),
            idempotencyKey: `wallet-order:${userId}:${orderId}:${this.idempotency.requireKey(key)}`,
          },
        });
        await this.commercial.bindPayment(tx, orderId, payment.id);
        await this.commercial.commitPayment(tx, payment.id);
        await this.ledger.postEntry(
          {
            debitAccountId: account.id,
            creditAccountId: escrowAccount.id,
            amount,
            referenceType: LedgerReferenceType.payment,
            referenceId: payment.id,
            idempotencyKey: `payment-settle:${payment.id}`,
            createdByUserId: userId,
          },
          tx,
        );
        const escrow = await tx.escrowHold.create({
          data: { orderId, paymentId: payment.id, amount },
        });
        if (milestone)
          await tx.orderMilestone.update({
            where: { id: milestone.id },
            data: { paymentStatus: PaymentStatus.succeeded },
          });
        const fullyPaid = !milestone || unpaid.length === 1;
        if (fullyPaid) {
          await this.workflow.transition(
            orderId,
            OrderStatus.paid,
            'system',
            userId,
            'پرداخت از موجودی معتبر کیف پول و انتقال به امانی',
            { paidAt: new Date() },
            tx,
            {
              type: 'wallet_to_escrow',
              amount,
              context: { paymentId: payment.id, escrowId: escrow.id },
            },
          );
          const profile = await tx.customerProfile.findUnique({
            where: { userId },
            select: {
              accountType: true,
              nationalId: true,
              companyName: true,
              companyNationalId: true,
              companyRegistrationNumber: true,
              economicCode: true,
              billingRecipientName: true,
              invoiceEmail: true,
              province: true,
              city: true,
              addressLine: true,
              postalCode: true,
            },
          });
          await tx.invoice.upsert({
            where: { orderId },
            create: {
              orderId,
              customerId: userId,
              invoiceNumber: `INV-${payment.id.toUpperCase()}`,
              amount: order.finalPrice,
              pdfFileKey: `invoices/${orderId}.pdf`,
              billingSnapshot: profile ?? undefined,
            },
            update: {},
          });
        }
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            actorRole: 'customer',
            action: 'wallet.order.paid',
            entityType: 'payment',
            entityId: payment.id,
            after: { orderId, amount, milestoneId: milestoneId ?? null },
            sensitivity: 'critical',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'payment.succeeded',
            payload: {
              userId,
              orderId,
              paymentId: payment.id,
              amount,
              paymentMethod: 'wallet',
            },
          },
        });
        return { payment, escrow, fullyPaid, alreadyProcessed: false };
      },
    });
  }
}
