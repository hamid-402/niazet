import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../finance/idempotency.service';
import { OrderWorkflowService } from '../orders/domain/order-workflow.service';
import { CommercialService } from './commercial.service';
import { FixedRegistrationOfferDto } from './commercial.dto';

@Injectable()
export class FixedRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly workflow: OrderWorkflowService,
    private readonly commercial: CommercialService,
  ) {}

  offer(
    customerId: string,
    orderId: string,
    dto: FixedRegistrationOfferDto,
    key: string,
  ) {
    return this.idempotency.execute({
      key,
      scope: `commercial.registration:${customerId}:${orderId}`,
      request: dto,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (order.status !== 'pending_triage' || order.version !== dto.version)
          throw new ConflictException(
            'وضعیت یا نسخهٔ سفارش تغییر کرده است؛ مسیر موجود را ادامه دهید.',
          );
        await this.workflow.transition(
          orderId,
          'triaging',
          'customer',
          customerId,
          'درخواست مالک برای قرارداد قطعیِ ثبت؛ فقط پس از اعتبارسنجی خدمت ثابت',
          {},
          tx,
        );
        const result = await this.commercial.offer(
          { id: customerId, role: 'customer' },
          orderId,
          { priority: dto.priority },
          key,
          tx,
        );
        await tx.auditLog.create({
          data: {
            actorUserId: customerId,
            actorRole: 'customer',
            action: 'commercial.registration.prepared',
            entityType: 'order',
            entityId: orderId,
            after: {
              revisionId: result.id,
              fingerprint: result.fingerprint,
              previousVersion: dto.version,
              priority: dto.priority,
            },
            sensitivity: 'sensitive',
          },
        });
        return result;
      },
    });
  }
}
