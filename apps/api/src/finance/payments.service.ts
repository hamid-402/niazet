import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EscrowStatus, LedgerAccountType, LedgerReferenceType, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { MockPaymentGateway } from './payment-gateway';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly gateway: MockPaymentGateway,
  ) {}

  async initiatePayment(params: {
    orderId: string;
    customerId: string;
    amount: number;
    milestoneId?: string;
  }) {
    const idempotencyKey = randomUUID();

    const payment = await this.prisma.payment.create({
      data: {
        orderId: params.orderId,
        customerId: params.customerId,
        milestoneId: params.milestoneId,
        amount: params.amount,
        gateway: 'mock',
        status: PaymentStatus.pending,
        idempotencyKey,
      },
    });

    const request = await this.gateway.createPaymentRequest({
      amount: params.amount,
      orderId: params.orderId,
      callbackUrl: `/v1/customer/orders/${params.orderId}/payments/${payment.id}/callback`,
    });

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayRef: request.gatewayRef, status: PaymentStatus.verifying },
    });

    return { payment: updated, redirectUrl: request.redirectUrl };
  }

  /**
   * پرداخت باید سمت سرور verify شود؛ مبلغ verify شده باید با مبلغ سفارش
   * برابر باشد؛ عملیات idempotent است (سند v4 §۱۲.۲/۲۷).
   */
  async verifyAndSettlePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد.');
    }

    if (payment.status === PaymentStatus.succeeded) {
      const escrow = await this.prisma.escrowHold.findUnique({ where: { paymentId } });
      return { payment, escrow, alreadyProcessed: true };
    }

    if (!payment.gatewayRef) {
      throw new BadRequestException('این پرداخت هنوز آغاز نشده است.');
    }

    const verification = await this.gateway.verifyPayment({
      gatewayRef: payment.gatewayRef,
      amount: payment.amount,
    });

    if (!verification.verified) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.failed, failureReason: 'gateway_verification_failed' },
      });
      throw new BadRequestException('پرداخت تأیید نشد.');
    }

    const clearingAccount = await this.ledger.getSystemAccount(
      LedgerAccountType.payment_gateway_clearing,
    );
    const escrowAccount = await this.ledger.getSystemAccount(LedgerAccountType.platform_escrow);

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.succeeded, verifiedAt: new Date() },
      });

      await this.ledger.postEntry(
        {
          debitAccountId: clearingAccount.id,
          creditAccountId: escrowAccount.id,
          amount: payment.amount,
          referenceType: LedgerReferenceType.payment,
          referenceId: payment.id,
          idempotencyKey: `payment-settle-${payment.id}`,
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

      return { payment: updatedPayment, escrow };
    });

    return { ...result, alreadyProcessed: false };
  }

  listForOrder(orderId: string) {
    return this.prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  listForAdmin(params: { status?: PaymentStatus; skip?: number; take?: number }) {
    return this.prisma.payment.findMany({
      where: params.status ? { status: params.status } : {},
      include: { order: { select: { code: true, title: true } }, customer: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }
}
