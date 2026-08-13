import { Injectable, NotFoundException } from '@nestjs/common';
import { FileKind, MessageVisibility, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrderQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findOneForCustomer(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.customerInclude(),
    });
    if (!order || order.customerId !== customerId)
      throw new NotFoundException('سفارش یافت نشد.');
    return order;
  }

  listForCustomer(
    customerId: string,
    params: { status?: string; skip?: number; take?: number },
  ) {
    return this.prisma.order.findMany({
      where: {
        customerId,
        ...(params.status ? { status: params.status as OrderStatus } : {}),
      },
      include: {
        serviceLine: { select: { title: true } },
        publicHandlers: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  listForExecutor(
    executorUserId: string,
    params: { skip?: number; take?: number },
  ) {
    return this.prisma.order.findMany({
      where: {
        assignments: {
          some: {
            unassignedAt: null,
            executorProfile: { userId: executorUserId },
          },
        },
      },
      include: { serviceLine: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async findOneForExecutor(executorUserId: string, orderId: string) {
    const assignment = await this.prisma.orderAssignment.findFirst({
      where: {
        orderId,
        unassignedAt: null,
        executorProfile: { userId: executorUserId },
      },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('سفارش یافت نشد.');
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        serviceLine: true,
        files: true,
        messages: { orderBy: { createdAt: 'asc' } },
        acceptanceCriteria: true,
        reports: true,
      },
    });
  }

  listForAdmin(params: {
    status?: string;
    serviceId?: string;
    search?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'code' | 'quotedPrice';
    sortDirection?: 'asc' | 'desc';
    skip?: number;
    take?: number;
  }) {
    return this.prisma.order.findMany({
      where: {
        ...(params.status ? { status: params.status as OrderStatus } : {}),
        ...(params.serviceId ? { serviceId: params.serviceId } : {}),
        ...(params.search
          ? {
              OR: [
                {
                  code: {
                    contains: params.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  title: {
                    contains: params.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { fullName: true, phone: true } },
        serviceLine: { select: { title: true } },
        publicHandlers: true,
      },
      orderBy: {
        [params.sortBy ?? 'createdAt']: params.sortDirection ?? 'desc',
      },
      skip: params.skip,
      take: params.take,
    });
  }

  async findOneForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { fullName: true, phone: true, email: true } },
        serviceLine: true,
        package: true,
        acceptanceCriteria: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        assignments: { include: { executorProfile: true, team: true } },
        publicHandlers: true,
        milestones: true,
        files: true,
        reports: true,
        messages: { orderBy: { createdAt: 'asc' } },
        payments: true,
        escrowHolds: true,
        disputes: true,
        tickets: true,
        feedback: true,
        qcReviews: { include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    return order;
  }

  private customerInclude() {
    return {
      serviceLine: true,
      package: true,
      acceptanceCriteria: true,
      statusHistory: { orderBy: { createdAt: 'asc' as const } },
      publicHandlers: { where: { visibleToCustomer: true, activeTo: null } },
      milestones: true,
      files: {
        where: { fileKind: { in: [FileKind.output, FileKind.revision] } },
      },
      reports: { where: { visibleToCustomer: true } },
      messages: {
        where: { visibility: MessageVisibility.customer_visible },
        orderBy: { createdAt: 'asc' as const },
      },
      payments: true,
      escrowHolds: true,
      tickets: true,
      feedback: true,
    };
  }
}
