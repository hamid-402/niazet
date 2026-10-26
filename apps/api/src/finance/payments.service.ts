import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EscrowStatus,
  LedgerAccountType,
  LedgerReferenceType,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';
import { PaymentGatewayService } from './zarinpal.gateway';
import { OrderWorkflowService } from '../orders/domain/order-workflow.service';

interface InitiatePaymentParams {
  orderId: string;
  customerId: string;
  amount: number;
  milestoneId?: string;
  idempotencyKey: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly gateway: PaymentGatewayService,
    private readonly idempotency: IdempotencyService,
    private readonly workflow: OrderWorkflowService = new OrderWorkflowService(
      prisma,
    ),
  ) {}

  initiatePayment(params: InitiatePaymentParams) {
    if (
      !Number.isSafeInteger(params.amount) ||
      params.amount <= 0 ||
      params.amount > 2_000_000_000
    )
      throw new BadRequestException('مبلغ پرداخت باید مثبت باشد.');
    return this.idempotency.execute({
      key: params.idempotencyKey,
      scope: `payment.initiate:${params.customerId}:${params.orderId}`,
      request: {
        amount: params.amount,
        milestoneId: params.milestoneId ?? null,
      },
      work: async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM orders WHERE id = ${params.orderId} FOR UPDATE`,
        );
        const payableOrder = await tx.order.findFirst({
          where: { id: params.orderId, customerId: params.customerId },
          include: { milestones: true },
        });
        if (!payableOrder) throw new NotFoundException('سفارش یافت نشد.');
        if (
          payableOrder.status !== 'pending_payment' ||
          payableOrder.currency !== 'IRT' ||
          (!params.milestoneId && payableOrder.finalPrice !== params.amount)
        )
          throw new BadRequestException(
            'سفارش یا قیمت قطعی آن دیگر قابل پرداخت نیست.',
          );
        if (
          payableOrder.milestones.length &&
          (!params.milestoneId ||
            payableOrder.milestones.some(
              (m) => !Number.isSafeInteger(m.amount) || m.amount < 1,
            ) ||
            payableOrder.milestones.reduce((sum, m) => sum + m.amount, 0) !==
              payableOrder.finalPrice)
        )
          throw new ConflictException(
            'مرحله پرداخت یا جمع مراحل با قیمت قطعی سفارش منطبق نیست.',
          );
        if (params.milestoneId) {
          const milestone = await tx.orderMilestone.findFirst({
            where: { id: params.milestoneId, orderId: params.orderId },
          });
          if (!milestone)
            throw new BadRequestException(
              'مرحله پرداخت متعلق به این سفارش نیست.',
            );
          if (
            milestone.amount !== params.amount ||
            milestone.paymentStatus === PaymentStatus.succeeded
          ) {
            throw new BadRequestException(
              'مرحله پرداخت نامعتبر یا قبلاً پرداخت شده است.',
            );
          }
        }

        const requestKey = `payment:${params.customerId}:${params.idempotencyKey}`;
        const payment = await tx.payment.create({
          data: {
            orderId: params.orderId,
            customerId: params.customerId,
            milestoneId: params.milestoneId,
            amount: params.amount,
            gateway: this.gateway.name,
            status: PaymentStatus.pending,
            idempotencyKey: requestKey,
          },
        });
        const gatewayRequest = await this.gateway.createPaymentRequest({
          amount: params.amount,
          orderId: params.orderId,
          callbackUrl: this.gateway.callbackUrl(params.orderId, payment.id),
        });
        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: {
            gatewayRef: gatewayRequest.gatewayRef,
            status: PaymentStatus.verifying,
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'payment.initiated',
            payload: {
              paymentId: payment.id,
              orderId: params.orderId,
              amount: params.amount,
            },
          },
        });
        return { payment: updated, redirectUrl: gatewayRequest.redirectUrl };
      },
    });
  }

  async verifyAndSettlePayment(params: {
    paymentId: string;
    orderId: string;
    customerId: string;
    idempotencyKey: string;
  }) {
    const result = await this.idempotency.execute({
      key: params.idempotencyKey,
      scope: `payment.verify:${params.paymentId}`,
      request: { orderId: params.orderId, customerId: params.customerId },
      work: (tx) => this.verifyAndSettleInTransaction(params, tx),
    });
    if ('verificationFailed' in result && result.verificationFailed) {
      throw new BadRequestException('پرداخت تأیید نشد.');
    }
    return result;
  }

  async verifyAndSettleInTransaction(
    params: {
      paymentId: string;
      orderId: string;
      customerId: string;
      idempotencyKey: string;
    },
    tx: Prisma.TransactionClient,
  ) {
    const payment = await tx.payment.findFirst({
      where: {
        id: params.paymentId,
        orderId: params.orderId,
        customerId: params.customerId,
      },
    });
    if (!payment)
      throw new NotFoundException('پرداخت متعلق به این سفارش یافت نشد.');

    if (payment.status === PaymentStatus.succeeded) {
      const escrow = await tx.escrowHold.findUnique({
        where: { paymentId: payment.id },
      });
      return { payment, escrow, alreadyProcessed: true };
    }
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM orders WHERE id = ${payment.orderId} FOR UPDATE`,
    );
    const payableOrder = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
    });
    const paidMilestone = payment.milestoneId
      ? await tx.orderMilestone.findUnique({
          where: { id: payment.milestoneId },
        })
      : null;
    if (
      payableOrder.status !== 'pending_payment' ||
      payableOrder.currency !== 'IRT' ||
      (!payment.milestoneId && payableOrder.finalPrice !== payment.amount) ||
      (payment.milestoneId && paidMilestone?.amount !== payment.amount) ||
      paidMilestone?.paymentStatus === PaymentStatus.succeeded
    ) {
      // Preserve late money for explicit financial review; never auto-refund,
      // re-open/finalize an order or credit a second escrow.
      await tx.payment.update({
        where: { id: payment.id },
        data: { failureReason: 'late_payment_requires_financial_review' },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: params.customerId,
          actorRole: 'customer',
          action: 'payment.review_required',
          entityType: 'payment',
          entityId: payment.id,
          after: {
            orderId: payment.orderId,
            status: payableOrder.status,
            reason: 'order_or_milestone_no_longer_payable',
          },
          sensitivity: 'critical',
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: 'payment.review_required',
          payload: { paymentId: payment.id, orderId: payment.orderId },
        },
      });
      return {
        payment,
        escrow: null,
        requiresFinancialReview: true as const,
        alreadyProcessed: true,
      };
    }
    if (!payment.gatewayRef)
      throw new BadRequestException('این پرداخت هنوز آغاز نشده است.');
    if (
      payment.status === PaymentStatus.failed ||
      payment.status === PaymentStatus.refunded
    ) {
      throw new BadRequestException('این پرداخت دیگر قابل تأیید نیست.');
    }

    if (payment.gateway !== this.gateway.name) {
      throw new BadRequestException(
        'درگاه این پرداخت با تنظیمات جاری سازگار نیست؛ پشتیبانی باید بررسی کند.',
      );
    }
    const verification = await this.gateway.verifyPayment({
      gatewayRef: payment.gatewayRef,
      amount: payment.amount,
    });
    if (!verification.verified) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.failed,
          failureReason: 'gateway_verification_failed',
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: 'payment.failed',
          payload: { paymentId: payment.id },
        },
      });
      return { paymentId: payment.id, verificationFailed: true as const };
    }

    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [PaymentStatus.pending, PaymentStatus.verifying] },
      },
      data: {
        status: PaymentStatus.succeeded,
        verifiedAt: new Date(),
        failureReason: null,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'وضعیت پرداخت هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.',
      );
    }

    const [clearingAccount, escrowAccount] = await Promise.all([
      this.ledger.getSystemAccount(
        LedgerAccountType.payment_gateway_clearing,
        tx,
      ),
      this.ledger.getSystemAccount(LedgerAccountType.platform_escrow, tx),
    ]);
    await this.ledger.postEntry(
      {
        debitAccountId: clearingAccount.id,
        creditAccountId: escrowAccount.id,
        amount: payment.amount,
        referenceType: LedgerReferenceType.payment,
        referenceId: payment.id,
        idempotencyKey: `payment-settle:${payment.id}`,
      },
      tx,
    );
    const escrow = await tx.escrowHold.create({
      data: {
        orderId: payment.orderId,
        paymentId: payment.id,
        amount: payment.amount,
        status: EscrowStatus.held,
      },
    });
    if (payment.milestoneId) {
      await tx.orderMilestone.update({
        where: { id: payment.milestoneId },
        data: { paymentStatus: PaymentStatus.succeeded },
      });
    }

    const unpaidMilestones = await tx.orderMilestone.count({
      where: {
        orderId: payment.orderId,
        paymentStatus: { not: PaymentStatus.succeeded },
      },
    });
    const order = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
    });
    if (order.status === 'pending_payment' && unpaidMilestones === 0) {
      await this.workflow.transition(
        order.id,
        'paid',
        'system',
        null,
        'پرداخت در درگاه تأیید و وجه وارد حساب امانی شد.',
        { paidAt: new Date() },
        tx,
        {
          type: 'payment_to_escrow',
          amount: payment.amount,
          context: { paymentId: payment.id, escrowId: escrow.id },
        },
      );
      const billingProfile = await tx.customerProfile.findUnique({
        where: { userId: payment.customerId },
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
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          customerId: payment.customerId,
          invoiceNumber: `INV-${payment.id.toUpperCase()}`,
          amount: order.finalPrice ?? payment.amount,
          pdfFileKey: `invoices/${order.id}.pdf`,
          billingSnapshot: billingProfile ?? undefined,
        },
        update: {},
      });
    }
    const updatedPayment = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: params.customerId,
        actorRole: 'customer',
        action: 'payment.settled',
        entityType: 'payment',
        entityId: payment.id,
        after: { orderId: payment.orderId, amount: payment.amount },
        sensitivity: 'critical',
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventType: 'payment.succeeded',
        payload: {
          paymentId: payment.id,
          orderId: payment.orderId,
          amount: payment.amount,
        },
      },
    });
    return { payment: updatedPayment, escrow, alreadyProcessed: false };
  }

  listForOrder(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForAdmin(params: {
    status?: PaymentStatus;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.payment.findMany({
      where: params.status ? { status: params.status } : {},
      include: {
        order: { select: { code: true, title: true } },
        customer: { select: { fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }
}
