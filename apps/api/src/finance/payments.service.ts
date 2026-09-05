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
import { MockPaymentGateway } from './payment-gateway';

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
    private readonly gateway: MockPaymentGateway,
    private readonly idempotency: IdempotencyService,
  ) {}

  initiatePayment(params: InitiatePaymentParams) {
    if (params.amount <= 0)
      throw new BadRequestException('مبلغ پرداخت باید مثبت باشد.');
    return this.idempotency.execute({
      key: params.idempotencyKey,
      scope: `payment.initiate:${params.customerId}:${params.orderId}`,
      request: {
        amount: params.amount,
        milestoneId: params.milestoneId ?? null,
      },
      work: async (tx) => {
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
            gateway: 'mock',
            status: PaymentStatus.pending,
            idempotencyKey: requestKey,
          },
        });
        const gatewayRequest = await this.gateway.createPaymentRequest({
          amount: params.amount,
          orderId: params.orderId,
          callbackUrl: `/v1/customer/orders/${params.orderId}/payments/${payment.id}/callback`,
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
    if (!payment.gatewayRef)
      throw new BadRequestException('این پرداخت هنوز آغاز نشده است.');
    if (
      payment.status === PaymentStatus.failed ||
      payment.status === PaymentStatus.refunded
    ) {
      throw new BadRequestException('این پرداخت دیگر قابل تأیید نیست.');
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
      const orderClaim = await tx.order.updateMany({
        where: {
          id: order.id,
          status: 'pending_payment',
          version: order.version,
        },
        data: { status: 'paid', paidAt: new Date(), version: { increment: 1 } },
      });
      if (orderClaim.count !== 1) {
        throw new ConflictException(
          'سفارش هم‌زمان با تأیید پرداخت تغییر کرده است.',
        );
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'pending_payment',
          toStatus: 'paid',
          source: 'system',
          note: 'پرداخت در درگاه تأیید و وجه وارد حساب امانی شد.',
          financialEffectType: 'payment_to_escrow',
          financialEffectAmount: payment.amount,
          context: { paymentId: payment.id, escrowId: escrow.id },
        },
      });
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
