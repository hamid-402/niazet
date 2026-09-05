import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';

@Injectable()
export class OrderDisputeService {
  assertCanRaise(
    order: { customerId: string; status: OrderStatus },
    actorUserId: string,
    actorRole: UserRole,
  ) {
    if (actorRole === UserRole.customer && order.customerId !== actorUserId) {
      throw new ForbiddenException('این سفارش متعلق به شما نیست.');
    }
    const disputableStatuses: OrderStatus[] = [
      OrderStatus.in_progress,
      OrderStatus.delivered,
    ];
    if (!disputableStatuses.includes(order.status)) {
      throw new BadRequestException(
        'در وضعیت فعلی امکان ثبت اختلاف وجود ندارد.',
      );
    }
  }
}
